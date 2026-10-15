import { bucketEvents, buckets, settings } from "@num/db";
import { comparePriority, floorToStep, isIsoDate, positiveBalances, recedeOrder, unassigned, type FillResult } from "@num/shared";
import { eq, isNull } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { bookStep } from "./book-step";
import { bucketBalances } from "./bucket-balance";
import { fundingPosition } from "./funding-book";
import { monthStart, monthlyRows } from "./funding-months";
import { withoutId, write, type Reader, type WriteInput, type WriteTx } from "./write";

function requireSetup(db: Reader) {
  if (!db.select().from(settings).where(eq(settings.key, "currency")).get()) {
    throw new ServiceError("setup_required", 409);
  }
}

/** A recede has the covered bucket in `otherBucketId`. */
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
 * The covers: N − S in total, in priority order. S is the part of the negative
 * balances that cash did not cover (the negative Unassigned). When a bucket stays short, the savings buckets with
 * `canRecede` give the missing part, the lowest priority first, each down to 0. Then the cover is written. A bucket
 * does not cover itself.
 */
function coverEvents(db: Reader, asOf: string): FillEvent[] {
  const state = pool(db, asOf);
  const active = db.select().from(buckets).where(isNull(buckets.archivedAt)).all().sort(comparePriority);
  const givers = recedeOrder(active);
  const recede = (bucketId: string, short: number) => {
    let given = 0;
    for (const giver of givers) {
      if (given >= short) {
        break;
      }
      const amount = giver.id === bucketId ? 0 : Math.min(short - given, Math.max(0, state.balanceOf(giver.id)));
      if (amount > 0) {
        state.add({ kind: "recede", bucketId: giver.id, otherBucketId: bucketId, amount, month: null });
        given += amount;
      }
    }
    return given;
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
 * The owed amounts of the month of `asOf`, in priority order, from Unassigned. It reads the covers of
 * the month, thus the covers are written first. An owed amount never causes a recede.
 */
function fundEvents(db: Reader, asOf: string): FillEvent[] {
  const month = asOf.slice(0, 7);
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
    const event = { id: crypto.randomUUID(), ...planned, date, undoneAt: null };
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
