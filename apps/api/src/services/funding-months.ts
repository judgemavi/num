import { bucketEvents, buckets, monthHolds, type BucketRow } from "@num/db";
import { addDays, comparePriority, isIsoDate, monthlyAmount, utcNow, type MonthFunding, type Owed } from "@num/shared";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { bookStep } from "./book-step";
import { bucketBalances } from "./bucket-balance";
import { readEmergencyFund } from "./emergency-fund";
import { commitmentsOf } from "./schedules";
import { withoutId, write, type Reader, type WriteInput } from "./write";

type MonthlyRow = { bucket: BucketRow; monthly: number; funded: number; owed: number };

/** The first day of the month (YYYY-MM). The fund events of the fill have this date. */
export function monthStart(month: string) {
  return `${month}-01`;
}

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
 * month that is not undone, and the amount still owed, for each active bucket that has started, in priority order
 * (decision 0059). The emergency bucket owes its target − its balance on `asOf`, minimum 0 (decision 0065). Its monthly
 * amount is the funding of the month plus that amount.
 */
export function monthlyRows(db: Reader, asOf: string): MonthlyRow[] {
  const month = asOf.slice(0, 7);
  const start = monthStart(month);
  const balances = bucketBalances(db, addDays(start, -1));
  // A cover of this month brings a negative balance back to 0 before the amounts are calculated. It is not funding.
  const covers = db
    .select({ bucketId: bucketEvents.bucketId, amount: bucketEvents.amount })
    .from(bucketEvents)
    .where(and(eq(bucketEvents.kind, "cover"), eq(bucketEvents.date, start), isNull(bucketEvents.undoneAt)))
    .all();
  for (const cover of covers) {
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
  const fund = rows.some((bucket) => bucket.kind === "emergency") ? readEmergencyFund(db, asOf) : null;
  const commitments = commitmentsOf(db, start);
  return rows.map((bucket) => {
    const paid = funded.get(bucket.id) ?? 0;
    if (bucket.kind === "emergency") {
      const owed = fund ? Math.max(0, fund.target - fund.balance) : 0;
      return { bucket, monthly: paid + owed, funded: paid, owed };
    }
    const monthly = monthlyAmount({ ...bucket, commitment: commitments.get(bucket.id) ?? null }, balances.get(bucket.id) ?? 0, month, step);
    return { bucket, monthly, funded: paid, owed: Math.max(0, monthly - paid) };
  });
}

export function heldMonths(db: Reader): Set<string> {
  return new Set(db.select({ month: monthHolds.month }).from(monthHolds).all().map((row) => row.month));
}

export function readOwed(db: Db, asOf: string): Owed {
  if (!isIsoDate(asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf });
  }
  const month = asOf.slice(0, 7);
  return {
    month,
    held: heldMonths(db).has(month),
    items: monthlyRows(db, asOf).map((row) => ({ bucketId: row.bucket.id, monthly: row.monthly, owed: row.owed })),
  };
}

export function listMonthFunding(db: Db): { items: MonthFunding[] } {
  const totals = new Map<string, number>();
  const events = db
    .select({ month: bucketEvents.month, amount: bucketEvents.amount, undoneAt: bucketEvents.undoneAt })
    .from(bucketEvents)
    .where(and(eq(bucketEvents.kind, "fund"), isNotNull(bucketEvents.month)))
    .all();
  for (const event of events) {
    if (event.month) {
      totals.set(event.month, (totals.get(event.month) ?? 0) + (event.undoneAt ? 0 : event.amount));
    }
  }
  const held = heldMonths(db);
  for (const month of held) {
    totals.set(month, totals.get(month) ?? 0);
  }
  const items = [...totals]
    .map(([month, total]) => ({ month, total, held: held.has(month) }))
    .filter((item) => item.held || item.total > 0)
    .sort((left, right) => (left.month < right.month ? 1 : left.month > right.month ? -1 : 0));
  return { items };
}

/** Undo the funding of one month. The money goes back to Unassigned, and the fill does not pay the month again. */
export function undoMonthFunding(db: Db, month: string, input: WriteInput): MonthFunding {
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
    if (heldMonths(tx).has(month)) {
      throw new ServiceError("funding_month_held", 409);
    }
    const events = tx
      .select()
      .from(bucketEvents)
      .where(and(eq(bucketEvents.kind, "fund"), eq(bucketEvents.month, month), isNull(bucketEvents.undoneAt)))
      .all();
    if (events.length === 0) {
      throw new ServiceError("funding_month_not_found", 404);
    }
    for (const event of events) {
      tx.update(bucketEvents).set({ undoneAt: at }).where(eq(bucketEvents.id, event.id)).run();
      tx.audit({
        entity: "bucket_events",
        entityId: event.id,
        action: "undo",
        before: withoutId(event),
        after: withoutId({ ...event, undoneAt: at }),
      });
    }
    tx.insert(monthHolds).values({ month, createdAt: at }).run();
    tx.audit({ entity: "month_holds", entityId: month, action: "create", before: null, after: { createdAt: at } });
    return { month, total: 0, held: true };
  });
}
