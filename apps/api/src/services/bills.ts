import { loadLinkIndex } from "./link-index";
import { buckets } from "@num/db";
import { billNeed, comparePriority, coverBills } from "@num/shared";
import { and, isNull, ne } from "drizzle-orm";
import type { Db } from "../db";
import { createFundingReads, type FundingReads } from "./funding-reads";
import { activeSchedules, scheduleAmounts } from "./schedules";
import type { Reader } from "./write";

/** The owed amount of each bucket for a month, read one time for each month. */
function owedByMonth(reads: FundingReads) {
  const months = new Map<string, Map<string, number>>();
  return (bucketId: string, month: string) => {
    let owed = months.get(month);
    if (!owed) {
      owed = new Map(reads.monthlyRows(month).map((row) => [row.bucket.id, row.owed]));
      months.set(month, owed);
    }
    return owed.get(bucketId) ?? 0;
  };
}

/**
 * The next payment of each active commitment in fill order. The gap is the part that its balance does not hold when it
 * is due in the next 30 days. Unassigned on `asOf` covers the gaps in fill order (§6): `covered` and `short`. A paused
 * bill is in the list. A `variable` amount uses the safe amount, as the monthly amount does (§7.6).
 */
export function listBillNeeds(db: Reader, asOf: string, shared?: FundingReads) {
  const reads = shared ?? createFundingReads(db, asOf);
  const views = new Map(activeSchedules(db).filter((view) => view.kind === "commitment").map((view) => [view.id, view]));
  const amounts = scheduleAmounts(db, [...views.values()], asOf);
  const balances = reads.position.balances;
  const closed = loadLinkIndex(db).closedDates;
  const rows = db
    .select()
    .from(buckets)
    .where(and(ne(buckets.kind, "income"), isNull(buckets.archivedAt)))
    .all()
    .sort(comparePriority);
  const needs = new Map(
    rows.flatMap((bucket) => {
      const schedule = bucket.kind === "commitment" ? views.get(bucket.id) : undefined;
      const need = schedule
        ? billNeed({
            schedule,
            amount: Math.abs(amounts.get(bucket.id)?.safe ?? 0),
            startDate: bucket.startDate,
            closed: closed.get(bucket.id) ?? new Set(),
            balance: balances.get(bucket.id) ?? 0,
            asOf,
          })
        : null;
      return need ? [[bucket.id, need] as const] : [];
    }),
  );
  const parts = coverBills({
    unassigned: reads.position.unassigned,
    // A bill with no next payment has no gap and takes no money.
    order: rows
      .filter((bucket) => bucket.kind !== "commitment" || needs.has(bucket.id))
      .map((bucket) => {
        const need = needs.get(bucket.id);
        return { bucketId: bucket.id, bill: need ? { gap: need.gap, dueDate: need.dueDate, paused: bucket.pausedAt !== null } : null };
      }),
    owed: owedByMonth(reads),
  });
  const items = [...needs].map(([bucketId, need]) => ({ bucketId, ...need, covered: 0, short: 0, ...parts.get(bucketId) }));
  return { items };
}

/** The bills with a short part: the part of the gap that Unassigned does not cover. */
export function billsShortCheck(db: Db, asOf: string, reads?: FundingReads) {
  const items = listBillNeeds(db, asOf, reads)
    .items.filter((item) => item.short > 0)
    .map((item) => ({ bucketId: item.bucketId, dueDate: item.dueDate, short: item.short }));
  return { code: "bills_short" as const, pass: items.length === 0, items };
}
