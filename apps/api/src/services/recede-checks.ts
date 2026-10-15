import { bucketEvents } from "@num/db";
import { forecastDates, monthLastDay, recedeAhead } from "@num/shared";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import type { Db } from "../db";
import { bookStep } from "./book-step";
import { bucketBalances } from "./bucket-balance";
import { emergencyBucket } from "./emergency-fund";
import { forecastInput } from "./forecast";
import { fundingPosition } from "./funding-book";

/** The recedes of the emergency bucket in the month of `asOf` that are not undone, for each covered bucket. */
function recedeMonth(db: Db, reserveId: string, asOf: string) {
  const month = asOf.slice(0, 7);
  const rows = db
    .select({ bucketId: bucketEvents.otherBucketId, amount: bucketEvents.amount })
    .from(bucketEvents)
    .where(
      and(
        eq(bucketEvents.kind, "recede"),
        eq(bucketEvents.bucketId, reserveId),
        isNull(bucketEvents.undoneAt),
        gte(bucketEvents.date, `${month}-01`),
        lte(bucketEvents.date, monthLastDay(month)),
      ),
    )
    .all();
  const covered = new Map<string, number>();
  for (const row of rows) {
    if (row.bucketId) {
      covered.set(row.bucketId, (covered.get(row.bucketId) ?? 0) + row.amount);
    }
  }
  const items = [...covered].map(([bucketId, amount]) => ({ bucketId, amount }));
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return { code: "recede_month" as const, pass: rows.length === 0, month, total, items };
}

/** The first date in the forecast when the pool goes below 0. */
function recedeAheadCheck(db: Db, reserveId: string, asOf: string) {
  const balances = bucketBalances(db, asOf);
  const input = forecastInput(db, asOf);
  const ahead = recedeAhead({
    asOf,
    dates: forecastDates(asOf),
    unassigned: fundingPosition(db, asOf).unassigned,
    flows: [...input.flows, ...input.transfersOut],
    balances,
    reserve: balances.get(reserveId) ?? 0,
    step: bookStep(db),
  });
  return { code: "recede_ahead" as const, pass: ahead.date === null, ...ahead };
}

/** The recede checks. None when the book has no active emergency bucket. */
export function recedeChecks(db: Db, asOf: string) {
  const reserve = emergencyBucket(db);
  if (!reserve || reserve.archivedAt) {
    return [];
  }
  return [recedeMonth(db, reserve.id, asOf), recedeAheadCheck(db, reserve.id, asOf)];
}
