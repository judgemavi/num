import { buckets, occurrenceLinks } from "@num/db";
import { billNeed, comparePriority, isIsoDate } from "@num/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { bucketBalances } from "./bucket-balance";
import { activeSchedules, scheduleAmounts } from "./schedules";
import type { Reader } from "./write";

/** The due dates of the occurrences that are skipped or linked, for each schedule. */
function closedDates(db: Reader) {
  const closed = new Map<string, Set<string>>();
  for (const link of db.select().from(occurrenceLinks).all()) {
    if (link.skipped || link.transactionId) {
      closed.set(link.bucketId, (closed.get(link.bucketId) ?? new Set()).add(link.dueDate));
    }
  }
  return closed;
}

/**
 * The next payment of each active commitment in fill order, and the part that its balance does not hold when it is
 * due in the next 30 days. A paused bill is in the list. A `variable` amount uses the
 * safe amount, as the monthly amount does (§7.6).
 */
export function listBillNeeds(db: Reader, asOf: string) {
  if (!isIsoDate(asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf });
  }
  const views = new Map(activeSchedules(db).filter((view) => view.kind === "commitment").map((view) => [view.id, view]));
  const amounts = scheduleAmounts(db, [...views.values()], asOf);
  const balances = bucketBalances(db, asOf);
  const closed = closedDates(db);
  const rows = db
    .select()
    .from(buckets)
    .where(and(eq(buckets.kind, "commitment"), isNull(buckets.archivedAt)))
    .all()
    .sort(comparePriority);
  const items = rows.flatMap((bucket) => {
    const schedule = views.get(bucket.id);
    if (!schedule) {
      return [];
    }
    const need = billNeed({
      schedule,
      amount: Math.abs(amounts.get(bucket.id)?.safe ?? 0),
      startDate: bucket.startDate,
      closed: closed.get(bucket.id) ?? new Set(),
      balance: balances.get(bucket.id) ?? 0,
      asOf,
    });
    return need ? [{ bucketId: bucket.id, ...need }] : [];
  });
  return { items };
}

/** The bills that do not hold their next payment, due in the next 30 days. */
export function billsShortCheck(db: Db, asOf: string) {
  const items = listBillNeeds(db, asOf)
    .items.filter((item) => item.short > 0)
    .map((item) => ({ bucketId: item.bucketId, dueDate: item.dueDate, short: item.short }));
  return { code: "bills_short" as const, pass: items.length === 0, items };
}
