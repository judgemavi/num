import { occurrenceLinks, transactions, type OccurrenceLinkRow } from "@num/db";
import { occurrenceDates, utcNow, type OccurrenceLink } from "@num/shared";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { applyLinkedSchedule } from "./match-apply";
import { requireSchedule, type ScheduleView } from "./schedules";
import { withoutId, write, type WriteTx, type WriteInput } from "./write";

function requireDueDate(row: ScheduleView, dueDate: string) {
  const found = occurrenceDates(row, dueDate).find((item) => item.dueDate === dueDate);
  if (!found) {
    throw new ServiceError("occurrence_not_found", 404);
  }
  return found;
}

function requireWritableSchedule(tx: WriteTx, id: string): ScheduleView {
  const row = requireSchedule(tx, id);
  if (row.archivedAt) {
    throw new ServiceError("bucket_archived", 409);
  }
  return row;
}

function existingLink(tx: WriteTx, bucketId: string, dueDate: string): OccurrenceLinkRow | undefined {
  return tx
    .select()
    .from(occurrenceLinks)
    .where(and(eq(occurrenceLinks.bucketId, bucketId), eq(occurrenceLinks.dueDate, dueDate)))
    .get();
}

/**
 * Link the transaction to the occurrence: the payment of the schedule on the due date. Part of a write. With `label`, the
 * transaction gets the label of the schedule. A save from the editor links without it: the fields of the form are the answer.
 */
export function addOccurrenceLink(
  tx: WriteTx,
  bucketId: string,
  dueDate: string,
  transactionId: string,
  at: string,
  label: boolean,
): OccurrenceLink {
  const schedule = requireWritableSchedule(tx, bucketId);
  requireDueDate(schedule, dueDate);
  if (existingLink(tx, bucketId, dueDate)) {
    throw new ServiceError("occurrence_taken", 409);
  }
  const txn = tx.select().from(transactions).where(eq(transactions.id, transactionId)).get();
  if (!txn) {
    throw new ServiceError("transaction_not_found", 404);
  }
  if (txn.accountId !== schedule.accountId) {
    throw new ServiceError("bucket_fields_invalid", 400, { field: "transactionId" });
  }
  const used = tx.select().from(occurrenceLinks).where(eq(occurrenceLinks.transactionId, transactionId)).get();
  if (used) {
    throw new ServiceError("transaction_already_linked", 409);
  }
  const row: OccurrenceLinkRow = {
    id: crypto.randomUUID(),
    bucketId,
    dueDate,
    transactionId,
    skipped: false,
    reason: null,
  };
  tx.insert(occurrenceLinks).values(row).run();
  tx.audit({
    entity: "occurrence_links",
    entityId: row.id,
    action: "link",
    before: null,
    after: withoutId(row),
  });
  if (label) {
    applyLinkedSchedule(tx, schedule, transactionId, true);
  }
  tx.update(transactions).set({ editedAt: at }).where(eq(transactions.id, transactionId)).run();
  return row;
}

export function linkOccurrence(
  db: Db,
  bucketId: string,
  dueDate: string,
  transactionId: string,
  input: WriteInput,
): OccurrenceLink {
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => addOccurrenceLink(tx, bucketId, dueDate, transactionId, at, true));
}

export function unlinkOccurrence(db: Db, bucketId: string, dueDate: string, input: WriteInput): OccurrenceLink {
  return write(db, { source: input.source, at: input.at }, (tx) => {
    requireWritableSchedule(tx, bucketId);
    const link = existingLink(tx, bucketId, dueDate);
    if (!link?.transactionId) {
      throw new ServiceError("link_not_found", 404);
    }
    tx.delete(occurrenceLinks).where(eq(occurrenceLinks.id, link.id)).run();
    tx.audit({
      entity: "occurrence_links",
      entityId: link.id,
      action: "unlink",
      before: withoutId(link),
      after: null,
    });
    return link;
  });
}

export function skipOccurrence(
  db: Db,
  bucketId: string,
  dueDate: string,
  reason: string,
  input: WriteInput,
): OccurrenceLink {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new ServiceError("bucket_fields_invalid", 400, { field: "reason" });
  }
  return write(db, { source: input.source, at: input.at }, (tx) => {
    const schedule = requireWritableSchedule(tx, bucketId);
    requireDueDate(schedule, dueDate);
    if (existingLink(tx, bucketId, dueDate)) {
      throw new ServiceError("occurrence_taken", 409);
    }
    const row: OccurrenceLinkRow = {
      id: crypto.randomUUID(),
      bucketId,
      dueDate,
      transactionId: null,
      skipped: true,
      reason: trimmed,
    };
    tx.insert(occurrenceLinks).values(row).run();
    tx.audit({
      entity: "occurrence_links",
      entityId: row.id,
      action: "skip",
      before: null,
      after: withoutId(row),
    });
    return row;
  });
}

export function restoreSkip(db: Db, bucketId: string, dueDate: string, input: WriteInput): OccurrenceLink {
  return write(db, { source: input.source, at: input.at }, (tx) => {
    requireWritableSchedule(tx, bucketId);
    const link = existingLink(tx, bucketId, dueDate);
    if (!link?.skipped) {
      throw new ServiceError("skip_not_found", 404);
    }
    tx.delete(occurrenceLinks).where(eq(occurrenceLinks.id, link.id)).run();
    tx.audit({
      entity: "occurrence_links",
      entityId: link.id,
      action: "restore",
      before: withoutId(link),
      after: null,
    });
    return link;
  });
}
