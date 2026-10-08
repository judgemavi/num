import { bucketEvents, buckets } from "@num/db";
import { isIsoDate, utcNow, type BucketCover, type BucketEvent, type BucketEventCreate, type BucketEventKind } from "@num/shared";
import { eq, isNull } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { bucketBalances } from "./bucket-balance";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

type EventRow = typeof bucketEvents.$inferSelect;

function asKind(value: string): BucketEventKind {
  if (value !== "fund" && value !== "move" && value !== "release") {
    throw new Error("Unknown bucket event kind");
  }
  return value;
}

function snapshot(row: EventRow) {
  return {
    kind: row.kind,
    bucketId: row.bucketId,
    otherBucketId: row.otherBucketId,
    amount: row.amount,
    date: row.date,
    note: row.note,
    fundingRunId: row.fundingRunId,
    undoneAt: row.undoneAt,
  };
}

function toEvent(row: EventRow): BucketEvent {
  return {
    id: row.id,
    kind: asKind(row.kind),
    bucketId: row.bucketId,
    otherBucketId: row.otherBucketId,
    amount: row.amount,
    date: row.date,
    note: row.note,
    fundingRunId: row.fundingRunId,
    undoneAt: row.undoneAt,
  };
}

function requireActiveBucket(tx: WriteTx, id: string) {
  const row = tx.select().from(buckets).where(eq(buckets.id, id)).get();
  if (!row) {
    throw new ServiceError("bucket_not_found", 404);
  }
  if (row.archivedAt) {
    throw new ServiceError("bucket_archived", 409);
  }
  return row;
}

function cleanNote(note: string | null | undefined): string | null {
  const value = note?.trim() ?? "";
  return value.length > 0 ? value : null;
}

export function createBucketEvent(db: Db, bucketId: string, input: BucketEventCreate & WriteInput): BucketEvent {
  if (!isIsoDate(input.date) || !Number.isSafeInteger(input.amount) || input.amount < 1) {
    throw new ServiceError("bucket_fields_invalid", 400);
  }
  const otherBucketId = input.kind === "move" ? (input.otherBucketId ?? null) : null;
  if (input.kind === "move" && otherBucketId === null) {
    throw new ServiceError("bucket_fields_invalid", 400);
  }
  if (otherBucketId === bucketId) {
    throw new ServiceError("bucket_same", 400);
  }
  const id = crypto.randomUUID();
  let created: BucketEvent | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
    requireActiveBucket(tx, bucketId);
    if (otherBucketId) {
      requireActiveBucket(tx, otherBucketId);
    }
    const row: EventRow = {
      id,
      kind: input.kind,
      bucketId,
      otherBucketId,
      amount: input.amount,
      date: input.date,
      note: cleanNote(input.note),
      fundingRunId: null,
      undoneAt: null,
    };
    tx.insert(bucketEvents).values(row).run();
    tx.audit({
      entity: "bucket_events",
      entityId: id,
      action: "create",
      before: null,
      after: snapshot(row),
    });
    created = toEvent(row);
  });
  if (!created) {
    throw new Error("Create did not return an event");
  }
  return created;
}

export function undoBucketEvent(db: Db, bucketId: string, eventId: string, input: WriteInput): BucketEvent {
  const at = input.at ?? utcNow();
  let undone: BucketEvent | undefined;
  write(db, { source: input.source, at }, (tx) => {
    const existing = tx.select().from(bucketEvents).where(eq(bucketEvents.id, eventId)).get();
    if (!existing || existing.bucketId !== bucketId) {
      throw new ServiceError("event_not_found", 404);
    }
    if (existing.undoneAt) {
      throw new ServiceError("event_undone", 409);
    }
    if (existing.fundingRunId) {
      throw new ServiceError("event_funding_run", 409);
    }
    const next = { ...existing, undoneAt: at };
    tx.update(bucketEvents).set({ undoneAt: at }).where(eq(bucketEvents.id, eventId)).run();
    tx.audit({
      entity: "bucket_events",
      entityId: eventId,
      action: "undo",
      before: snapshot(existing),
      after: snapshot(next),
    });
    undone = toEvent(next);
  });
  if (!undone) {
    throw new Error("Undo did not return an event");
  }
  return undone;
}

export function listBucketEvents(db: Db): { items: BucketEvent[] } {
  const rows = db.select().from(bucketEvents).where(isNull(bucketEvents.undoneAt)).all();
  rows.sort((left, right) => {
    if (left.date !== right.date) {
      return left.date < right.date ? 1 : -1;
    }
    return left.id < right.id ? 1 : -1;
  });
  return { items: rows.map(toEvent) };
}

export function coverBucket(db: Db, bucketId: string, input: BucketCover & WriteInput): BucketEvent {
  if (!isIsoDate(input.date)) {
    throw new ServiceError("bucket_fields_invalid", 400);
  }
  if (input.fromBucketId === bucketId) {
    throw new ServiceError("bucket_same", 400);
  }
  const id = crypto.randomUUID();
  let created: BucketEvent | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
    requireActiveBucket(tx, bucketId);
    requireActiveBucket(tx, input.fromBucketId);
    const balances = bucketBalances(tx);
    const balance = balances.get(bucketId) ?? 0;
    if (balance >= 0) {
      throw new ServiceError("bucket_not_overspent", 409);
    }
    const need = -balance;
    const available = balances.get(input.fromBucketId) ?? 0;
    if (available < need) {
      throw new ServiceError("bucket_short", 409);
    }
    const row: EventRow = {
      id,
      kind: "move",
      bucketId: input.fromBucketId,
      otherBucketId: bucketId,
      amount: need,
      date: input.date,
      note: null,
      fundingRunId: null,
      undoneAt: null,
    };
    tx.insert(bucketEvents).values(row).run();
    tx.audit({
      entity: "bucket_events",
      entityId: id,
      action: "create",
      before: null,
      after: snapshot(row),
    });
    created = toEvent(row);
  });
  if (!created) {
    throw new Error("Cover did not return an event");
  }
  return created;
}
