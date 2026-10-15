import { bucketEvents, buckets } from "@num/db";
import { forecastDates, monthLastDay, pausePlan, projectedPoolShort, recedeOrder, recedePlan } from "@num/shared";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import type { Db } from "../db";
import { bookStep } from "./book-step";
import { bucketBalances } from "./bucket-balance";
import { forecastInput } from "./forecast";
import { fundingPosition } from "./funding-book";
import { monthlyRows } from "./funding-months";

/** The recedes in the month of `asOf` that are not undone, for each pair of savings and covered bucket. */
function savingsUsed(db: Db, asOf: string) {
  const month = asOf.slice(0, 7);
  const rows = db
    .select({ bucketId: bucketEvents.bucketId, coveredId: bucketEvents.otherBucketId, amount: bucketEvents.amount })
    .from(bucketEvents)
    .where(
      and(
        eq(bucketEvents.kind, "recede"),
        isNull(bucketEvents.undoneAt),
        gte(bucketEvents.date, `${month}-01`),
        lte(bucketEvents.date, monthLastDay(month)),
      ),
    )
    .all();
  const pairs = new Map<string, { bucketId: string; coveredId: string; amount: number }>();
  for (const row of rows) {
    if (row.coveredId) {
      const key = `${row.bucketId}|${row.coveredId}`;
      const amount = (pairs.get(key)?.amount ?? 0) + row.amount;
      pairs.set(key, { bucketId: row.bucketId, coveredId: row.coveredId, amount });
    }
  }
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return { code: "savings_used" as const, pass: rows.length === 0, month, total, items: [...pairs.values()] };
}

/**
 * The first date in the forecast when the pool goes below 0, the buckets to pause, the buckets that would give money
 * back and the part that no bucket gives.
 */
function poolShort(db: Db, asOf: string) {
  const step = bookStep(db);
  const balances = bucketBalances(db, asOf);
  const input = forecastInput(db, asOf);
  const { date, short } = projectedPoolShort({
    asOf,
    dates: forecastDates(asOf),
    unassigned: fundingPosition(db, asOf).unassigned,
    flows: [...input.flows, ...input.transfersOut],
    balances,
    step,
  });
  if (date === null) {
    return { code: "pool_short" as const, pass: true, date, short, pause: [], recede: [], uncovered: 0 };
  }
  const candidates = monthlyRows(db, asOf).map((row) => ({ ...row.bucket, paused: row.bucket.pausedAt !== null, monthly: row.monthly }));
  const active = db.select().from(buckets).where(isNull(buckets.archivedAt)).all();
  const order = recedeOrder(active).map((bucket) => ({ id: bucket.id, balance: balances.get(bucket.id) ?? 0 }));
  const recede = recedePlan(order, short, step);
  return { code: "pool_short" as const, pass: false, date, short, pause: pausePlan(candidates, short), recede: recede.items, uncovered: recede.uncovered };
}

/** The checks of the pool: the savings used this month and the pool ahead. */
export function poolChecks(db: Db, asOf: string) {
  return [savingsUsed(db, asOf), poolShort(db, asOf)];
}
