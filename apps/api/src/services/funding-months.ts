import { bucketEvents, buckets, type BucketRow } from "@num/db";
import { addDays, monthStart, comparePriority, monthlyAmount, type Owed, type EmergencyFund } from "@num/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db";
import { bookStep } from "./book-step";
import { bucketBalances } from "./bucket-balance";
import { readEmergencyFund } from "./emergency-fund";
import { commitmentsOf } from "./schedules";
import type { Reader } from "./write";

type MonthlyRow = { bucket: BucketRow; monthly: number; funded: number; owed: number };

function fundedByBucket(db: Reader, month: string) {
  const funded = new Map<string, number>();
  const events = db
    .select({ bucketId: bucketEvents.bucketId, amount: bucketEvents.amount })
    .from(bucketEvents)
    .where(and(eq(bucketEvents.kind, "fund"), eq(bucketEvents.month, month), isNull(bucketEvents.undoneAt)))
    .all();
  for (const event of events) {
    funded.set(event.bucketId, (funded.get(event.bucketId) ?? 0) + event.amount);
  }
  return funded;
}

/**
 * The monthly amount (from the balance at the start of the month, with the covers of the month), the funding of the
 * month that is not undone, and the amount still owed, for each active bucket that has started, in priority order.
 * The emergency bucket owes its target − its balance on `asOf`, minimum 0. Its monthly amount is the funding of the
 * month plus that amount. A paused bucket has a monthly amount of 0 and owes nothing.
 * For a `month` after the month of `asOf`, the start balance is the balance on `asOf`: the app does not know the
 * balance at the start of that month yet.
 */
export function monthlyRows(
  db: Reader,
  asOf: string,
  month = asOf.slice(0, 7),
  reads?: { balances: ReadonlyMap<string, number>; emergencyFund: () => EmergencyFund | null; covers?: readonly { bucketId: string; amount: number }[] },
): MonthlyRow[] {
  const start = monthStart(month);
  const balances = new Map(reads?.balances ?? bucketBalances(db, month > asOf.slice(0, 7) ? asOf : addDays(start, -1)));
  // A cover of this month brings a negative balance back to 0 before the amounts are calculated. It is not funding.
  const covers = db
    .select({ bucketId: bucketEvents.bucketId, amount: bucketEvents.amount })
    .from(bucketEvents)
    .where(and(eq(bucketEvents.kind, "cover"), eq(bucketEvents.date, start), isNull(bucketEvents.undoneAt)))
    .all();
  for (const cover of [...covers, ...(reads?.covers ?? [])]) {
    balances.set(cover.bucketId, (balances.get(cover.bucketId) ?? 0) + cover.amount);
  }
  const funded = fundedByBucket(db, month);
  const step = bookStep(db);
  const rows = db
    .select()
    .from(buckets)
    .where(isNull(buckets.archivedAt))
    .all()
    .filter((bucket) => bucket.kind !== "income" && bucket.startDate.slice(0, 7) <= month)
    .sort(comparePriority);
  const fund = rows.some((bucket) => bucket.kind === "emergency") ? (reads ? reads.emergencyFund() : readEmergencyFund(db, asOf)) : null;
  const commitments = commitmentsOf(db, start);
  return rows.map((bucket) => {
    const paid = funded.get(bucket.id) ?? 0;
    if (bucket.pausedAt !== null) {
      return { bucket, monthly: 0, funded: paid, owed: 0 };
    }
    if (bucket.kind === "emergency") {
      const owed = fund ? Math.max(0, fund.target - fund.balance) : 0;
      return { bucket, monthly: paid + owed, funded: paid, owed };
    }
    const monthly = monthlyAmount({ ...bucket, paused: false, commitment: commitments.get(bucket.id) ?? null }, balances.get(bucket.id) ?? 0, month, step);
    return { bucket, monthly, funded: paid, owed: Math.max(0, monthly - paid) };
  });
}

export function readOwed(db: Db, asOf: string): Owed {
  const month = asOf.slice(0, 7);
  return {
    month,
    items: monthlyRows(db, asOf).map((row) => ({ bucketId: row.bucket.id, monthly: row.monthly, owed: row.owed })),
  };
}
