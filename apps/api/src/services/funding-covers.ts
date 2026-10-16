import { buckets } from "@num/db";
import { comparePriority, positiveBalances, recedeOrder, unassigned } from "@num/shared";
import { isNull } from "drizzle-orm";
import { positionOn } from "./funding-book";
import type { Reader } from "./write";

/** A recede has the covered bucket in `otherBucketId`. */
export type FillEvent = { kind: "cover" | "fund" | "recede"; bucketId: string; otherBucketId: string | null; amount: number; month: string | null };

/** The bucket balances on `asOf` in memory, and Unassigned on `asOf` after the events that are added. */
function pool(db: Reader, asOf: string) {
  const { onBudgetTotal: total, balances } = positionOn(db, asOf);
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
export function coverEvents(db: Reader, asOf: string): FillEvent[] {
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
