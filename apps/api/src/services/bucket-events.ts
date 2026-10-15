import { bucketEvents, buckets, type BucketEventRow } from "@num/db";
import { isIsoDate, utcNow, type BucketCover, type BucketEvent, type BucketEventCreate } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { bucketBalances } from "./bucket-balance";
import { fundingPosition } from "./funding-book";
import { withoutId, write, type WriteTx, type WriteInput } from "./write";
import { requireWholeAmounts } from "./book-step";

type EventWriteInput = WriteInput & {
  asOf?: string;
};

function requireActiveBucket(tx: WriteTx, id: string) {
  const row = tx.select().from(buckets).where(eq(buckets.id, id)).get();
  if (!row) {
    throw new ServiceError("bucket_not_found", 404);
  }
  if (row.archivedAt) {
    throw new ServiceError("bucket_archived", 409);
  }
  // An income holds no money and has no events.
  if (row.kind === "income") {
    throw new ServiceError("bucket_fields_invalid", 400, { field: "kind" });
  }
  return row;
}

function cleanNote(note: string | null | undefined) {
  const value = note?.trim() ?? "";
  return value.length > 0 ? value : null;
}

export function createBucketEvent(db: Db, bucketId: string, input: BucketEventCreate & EventWriteInput): BucketEvent {
  if (!isIsoDate(input.date) || !Number.isSafeInteger(input.amount) || input.amount < 1) {
    throw new ServiceError("bucket_fields_invalid", 400);
  }
  requireWholeAmounts(db, [input.amount]);
  const otherBucketId = input.kind === "move" ? (input.otherBucketId ?? null) : null;
  if (input.kind === "move" && otherBucketId === null) {
    throw new ServiceError("bucket_fields_invalid", 400);
  }
  if (otherBucketId === bucketId) {
    throw new ServiceError("bucket_same", 400);
  }
  const id = crypto.randomUUID();
  return write(db, { source: input.source, at: input.at }, (tx) => {
    requireActiveBucket(tx, bucketId);
    if (otherBucketId) {
      requireActiveBucket(tx, otherBucketId);
    }
    if (input.kind === "fund") {
      if (!input.asOf) {
        throw new ServiceError("as_of_required", 400);
      }
      if (!isIsoDate(input.asOf)) {
        throw new ServiceError("as_of_invalid", 400, { asOf: input.asOf });
      }
      const free = fundingPosition(tx, input.asOf).unassigned;
      if (input.amount > free) {
        throw new ServiceError("fund_over_unassigned", 409);
      }
    }
    if (input.kind === "release") {
      const balance = bucketBalances(tx).get(bucketId) ?? 0;
      if (input.amount > balance) {
        throw new ServiceError("release_over_balance", 409);
      }
    }
    const row: BucketEventRow = {
      id,
      kind: input.kind,
      bucketId,
      otherBucketId,
      amount: input.amount,
      date: input.date,
      note: cleanNote(input.note),
      month: null,
      undoneAt: null,
    };
    tx.insert(bucketEvents).values(row).run();
    tx.audit({
      entity: "bucket_events",
      entityId: id,
      action: "create",
      before: null,
      after: withoutId(row),
    });
    return row;
  });
}

export function undoBucketEvent(db: Db, bucketId: string, eventId: string, input: EventWriteInput): BucketEvent {
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
    const existing = tx.select().from(bucketEvents).where(eq(bucketEvents.id, eventId)).get();
    if (!existing || existing.bucketId !== bucketId) {
      throw new ServiceError("event_not_found", 404);
    }
    if (existing.undoneAt) {
      throw new ServiceError("event_undone", 409);
    }
    if (existing.kind === "cover") {
      throw new ServiceError("event_cover", 409);
    }
    if (existing.month) {
      throw new ServiceError("event_month_funding", 409);
    }
    if (existing.kind === "recede") {
      throw new ServiceError("event_recede", 409);
    }
    const next = { ...existing, undoneAt: at };
    tx.update(bucketEvents).set({ undoneAt: at }).where(eq(bucketEvents.id, eventId)).run();
    tx.audit({
      entity: "bucket_events",
      entityId: eventId,
      action: "undo",
      before: withoutId(existing),
      after: withoutId(next),
    });
    return next;
  });
}

/** Cover an overspent bucket with the amount that it is over: a move from a second bucket. The source must have the whole amount. */
export function coverBucket(db: Db, bucketId: string, input: BucketCover & WriteInput): BucketEvent {
  if (!isIsoDate(input.date)) {
    throw new ServiceError("bucket_fields_invalid", 400);
  }
  const { fromBucketId } = input;
  if (fromBucketId === bucketId) {
    throw new ServiceError("bucket_same", 400);
  }
  const id = crypto.randomUUID();
  return write(db, { source: input.source, at: input.at }, (tx) => {
    requireActiveBucket(tx, bucketId);
    requireActiveBucket(tx, fromBucketId);
    const balances = bucketBalances(tx);
    const balance = balances.get(bucketId) ?? 0;
    if (balance >= 0) {
      throw new ServiceError("bucket_not_overspent", 409);
    }
    const need = -balance;
    if ((balances.get(fromBucketId) ?? 0) < need) {
      throw new ServiceError("bucket_short", 409);
    }
    const row: BucketEventRow = {
      id,
      kind: "move",
      bucketId: fromBucketId,
      otherBucketId: bucketId,
      amount: need,
      date: input.date,
      note: null,
      month: null,
      undoneAt: null,
    };
    tx.insert(bucketEvents).values(row).run();
    tx.audit({
      entity: "bucket_events",
      entityId: id,
      action: "create",
      before: null,
      after: withoutId(row),
    });
    return row;
  });
}
