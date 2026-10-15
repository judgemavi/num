import { bucketEvents, buckets, monthHolds, settings } from "@num/db";
import { comparePriority, floorToStep, isIsoDate, positiveBalances, unassigned, utcNow, type FillResult } from "@num/shared";
import { eq, isNull } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { bookStep } from "./book-step";
import { bucketBalances } from "./bucket-balance";
import { fundingPosition } from "./funding-book";
import { heldMonths, monthStart, monthlyRows } from "./funding-months";
import { withoutId, write, type Reader, type WriteInput, type WriteTx } from "./write";

function requireSetup(db: Reader) {
  if (!db.select().from(settings).where(eq(settings.key, "currency")).get()) {
    throw new ServiceError("setup_required", 409);
  }
}

/** A recede has the covered bucket in `otherBucketId` (decision 0065). */
type FillEvent = { kind: "cover" | "fund" | "recede"; bucketId: string; otherBucketId: string | null; amount: number; month: string | null };

/** The bucket balances in memory, and Unassigned after the events that are added. */
function pool(db: Reader, asOf: string) {
  const total = fundingPosition(db, asOf).onBudgetTotal;
  const balances = bucketBalances(db);
  const events: FillEvent[] = [];
  const balanceOf = (id: string) => balances.get(id) ?? 0;
  return {
    events,
    balanceOf,
    free: () => unassigned(total, positiveBalances([...balances.values()])),
    add(event: FillEvent) {
      events.push(event);
      balances.set(event.bucketId, balanceOf(event.bucketId) + (event.kind === "recede" ? -event.amount : event.amount));
    },
  };
}

/**
 * The covers (decisions 0059 item 8, 0065 item 3): N − S in total, in priority order. S is the part of the negative
 * balances that cash did not cover (the negative Unassigned). When a bucket stays short, a recede gives the missing part
 * from the emergency bucket, down to 0, then the cover is written. The emergency bucket does not cover itself.
 */
function coverEvents(db: Reader, asOf: string): FillEvent[] {
  const state = pool(db, asOf);
  const active = db.select().from(buckets).where(isNull(buckets.archivedAt)).all().sort(comparePriority);
  const reserve = active.find((bucket) => bucket.kind === "emergency");
  const recede = (bucketId: string, short: number) => {
    if (!reserve || reserve.id === bucketId) {
      return 0;
    }
    const amount = Math.min(short, Math.max(0, state.balanceOf(reserve.id)));
    if (amount > 0) {
      state.add({ kind: "recede", bucketId: reserve.id, otherBucketId: bucketId, amount, month: null });
    }
    return amount;
  };
  const negative = active.flatMap((bucket) => (state.balanceOf(bucket.id) < 0 ? [{ bucket, need: -state.balanceOf(bucket.id) }] : []));
  const needs = negative.reduce((sum, item) => sum + item.need, 0);
  let cover = needs - Math.min(needs, Math.max(0, -state.free()));
  for (const { bucket, need } of negative) {
    const paid = Math.min(need, cover);
    cover -= paid;
    const amount = paid + recede(bucket.id, need - paid);
    if (amount > 0) {
      state.add({ kind: "cover", bucketId: bucket.id, otherBucketId: null, amount, month: null });
    }
  }
  return state.events;
}

/**
 * The owed amounts of the month of `asOf`, in priority order, from Unassigned (decision 0059). It reads the covers of
 * the month, thus the covers are written first. An owed amount never causes a recede. A held month owes nothing.
 */
function fundEvents(db: Reader, asOf: string): FillEvent[] {
  const month = asOf.slice(0, 7);
  if (heldMonths(db).has(month)) {
    return [];
  }
  const step = bookStep(db);
  const state = pool(db, asOf);
  for (const row of monthlyRows(db, asOf)) {
    const amount = Math.min(row.owed, floorToStep(state.free(), step));
    if (amount > 0) {
      state.add({ kind: "fund", bucketId: row.bucket.id, otherBucketId: null, amount, month });
    }
  }
  return state.events;
}

/** Write events of the fill. Each event has the date of the first day of the month of `asOf`. */
function writeEvents(tx: WriteTx, asOf: string, events: readonly FillEvent[]) {
  const date = monthStart(asOf.slice(0, 7));
  for (const planned of events) {
    const event = { id: crypto.randomUUID(), ...planned, date, note: null, undoneAt: null };
    tx.insert(bucketEvents).values(event).run();
    tx.audit({ entity: "bucket_events", entityId: event.id, action: "create", before: null, after: withoutId(event) });
  }
}

/** The covers and recedes first, then the owed amounts from the balances after them. */
function fillInTx(tx: WriteTx, asOf: string): FillResult {
  requireSetup(tx);
  const covers = coverEvents(tx, asOf);
  writeEvents(tx, asOf, covers);
  const funds = fundEvents(tx, asOf);
  writeEvents(tx, asOf, funds);
  return { paid: funds.reduce((sum, event) => sum + event.amount, 0), payments: covers.length + funds.length };
}

/** True when a fill would write. With no cover, the owed amounts read the same balances as in the write. */
function fillNeeded(db: Reader, asOf: string): boolean {
  requireSetup(db);
  return coverEvents(db, asOf).length > 0 || fundEvents(db, asOf).length > 0;
}

/** The fill: one write with `asOf` from the request. It writes nothing when nothing is owed or covered (it is idempotent). */
export function fillBuckets(db: Db, input: WriteInput & { asOf: string }): FillResult {
  if (!isIsoDate(input.asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf: input.asOf });
  }
  if (!fillNeeded(db, input.asOf)) {
    return { paid: 0, payments: 0 };
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
