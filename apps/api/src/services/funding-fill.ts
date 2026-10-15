import { bucketEvents, buckets, monthHolds, settings } from "@num/db";
import { floorToStep, isIsoDate, utcNow, type FillResult } from "@num/shared";
import { eq, isNull } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { bookStep } from "./book-step";
import { insertEmergencyBucket } from "./buckets";
import { bucketBalances } from "./bucket-balance";
import { fundingPosition } from "./funding-book";
import { heldMonths, monthStart, monthlyRows } from "./funding-months";
import { withoutId, write, type Reader, type WriteInput, type WriteTx } from "./write";

function requireSetup(db: Reader) {
  if (!db.select().from(settings).where(eq(settings.key, "currency")).get()) {
    throw new ServiceError("setup_required", 409);
  }
}

function hasEmergency(db: Reader) {
  return db.select({ id: buckets.id }).from(buckets).where(eq(buckets.kind, "emergency")).get() !== undefined;
}

/** The active buckets with a negative balance, in priority order. */
function negativeBuckets(db: Reader) {
  const balances = bucketBalances(db);
  return db
    .select()
    .from(buckets)
    .where(isNull(buckets.archivedAt))
    .all()
    .sort((left, right) => left.priority - right.priority || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .flatMap((bucket) => ((balances.get(bucket.id) ?? 0) < 0 ? [{ bucket, need: -(balances.get(bucket.id) ?? 0) }] : []));
}

/**
 * The part of the negative balances that Unassigned covers (decision 0059 item 8). The overspending already lowered
 * Unassigned. The part that cash did not cover is the negative Unassigned, and the buckets of lowest priority keep it.
 */
function coverTotal(db: Reader, asOf: string, needs: number): number {
  return needs - Math.min(needs, Math.max(0, -fundingPosition(db, asOf).unassigned));
}

/** True when a fill would write: the emergency bucket is missing, or the month of `asOf` is not held, has an owed amount and Unassigned has room. */
function fillNeeded(db: Db, asOf: string): boolean {
  requireSetup(db);
  if (!hasEmergency(db)) {
    return true;
  }
  const negative = negativeBuckets(db);
  if (coverTotal(db, asOf, negative.reduce((sum, item) => sum + item.need, 0)) > 0) {
    return true;
  }
  if (floorToStep(fundingPosition(db, asOf).unassigned, bookStep(db)) <= 0) {
    return false;
  }
  const month = asOf.slice(0, 7);
  return !heldMonths(db).has(month) && monthlyRows(db, month).some((row) => row.owed > 0);
}

/**
 * Pay the owed amounts of the month of `asOf` from Unassigned, in priority order (decision 0059). It stops when
 * Unassigned is used. A month that the user undid is held and is skipped. A past month is never paid.
 */
function fillInTx(tx: WriteTx, asOf: string): FillResult {
  requireSetup(tx);
  const madeBucket = !hasEmergency(tx);
  if (madeBucket) {
    insertEmergencyBucket(tx, asOf);
  }
  const month = asOf.slice(0, 7);
  const step = bookStep(tx);
  let paid = 0;
  let payments = 0;
  const negative = negativeBuckets(tx);
  let cover = coverTotal(tx, asOf, negative.reduce((sum, item) => sum + item.need, 0));
  for (const { bucket, need } of negative) {
    const amount = Math.min(need, cover);
    if (amount <= 0) {
      break;
    }
    const event = {
      id: crypto.randomUUID(),
      kind: "cover" as const,
      bucketId: bucket.id,
      otherBucketId: null,
      amount,
      date: monthStart(month),
      note: null,
      month: null,
      undoneAt: null,
    };
    tx.insert(bucketEvents).values(event).run();
    tx.audit({ entity: "bucket_events", entityId: event.id, action: "create", before: null, after: withoutId(event) });
    cover -= amount;
    payments += 1;
  }
  let room = floorToStep(fundingPosition(tx, asOf).unassigned, step);
  if (!heldMonths(tx).has(month)) {
    for (const row of monthlyRows(tx, month)) {
      const amount = Math.min(row.owed, room);
      if (amount <= 0) {
        continue;
      }
      const event = {
        id: crypto.randomUUID(),
        kind: "fund" as const,
        bucketId: row.bucket.id,
        otherBucketId: null,
        amount,
        date: monthStart(month),
        note: null,
        month,
        undoneAt: null,
      };
      tx.insert(bucketEvents).values(event).run();
      tx.audit({ entity: "bucket_events", entityId: event.id, action: "create", before: null, after: withoutId(event) });
      paid += amount;
      payments += 1;
      room = floorToStep(fundingPosition(tx, asOf).unassigned, step);
      if (room <= 0) {
        break;
      }
    }
  }
  return { paid, payments, madeBucket };
}

/** The fill: one write with `asOf` from the request. It writes nothing when nothing is owed or Unassigned is used. */
export function fillBuckets(db: Db, input: WriteInput & { asOf: string }): FillResult {
  if (!isIsoDate(input.asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf: input.asOf });
  }
  if (!fillNeeded(db, input.asOf)) {
    return { paid: 0, payments: 0, madeBucket: false };
  }
  return write(db, { source: input.source, at: input.at }, (tx) => fillInTx(tx, input.asOf));
}

/** "Fund again": remove the hold of the month, then fill. */
export function fundMonthAgain(db: Db, month: string, input: WriteInput & { asOf: string }): FillResult {
  if (!isIsoDate(input.asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf: input.asOf });
  }
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
    const hold = tx.select().from(monthHolds).where(eq(monthHolds.month, month)).get();
    if (!hold) {
      throw new ServiceError("funding_month_not_held", 409);
    }
    tx.delete(monthHolds).where(eq(monthHolds.month, month)).run();
    tx.audit({ entity: "month_holds", entityId: month, action: "delete", before: { createdAt: hold.createdAt }, after: null });
    return fillInTx(tx, input.asOf);
  });
}
