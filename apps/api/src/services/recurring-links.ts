import { occurrenceLinks, recurringPlans, transactions, type OccurrenceLinkRow, type RecurringPlanRow } from "@num/db";
import { occurrenceDates, utcNow, type OccurrenceLink } from "@num/shared";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { applyLinkedPlan } from "./match-apply";
import { withoutId, write, type WriteTx, type WriteInput } from "./write";

function requireDueDate(row: RecurringPlanRow, dueDate: string) {
  const found = occurrenceDates(row, dueDate).find((item) => item.dueDate === dueDate);
  if (!found) {
    throw new ServiceError("occurrence_not_found", 404);
  }
  return found;
}

function requireWritablePlan(tx: WriteTx, id: string): RecurringPlanRow {
  const row = tx.select().from(recurringPlans).where(eq(recurringPlans.id, id)).get();
  if (!row) {
    throw new ServiceError("plan_not_found", 404);
  }
  if (row.archivedAt) {
    throw new ServiceError("plan_archived", 409);
  }
  return row;
}

function existingLink(tx: WriteTx, planId: string, dueDate: string): OccurrenceLinkRow | undefined {
  return tx
    .select()
    .from(occurrenceLinks)
    .where(and(eq(occurrenceLinks.planId, planId), eq(occurrenceLinks.dueDate, dueDate)))
    .get();
}

export function linkOccurrence(
  db: Db,
  planId: string,
  dueDate: string,
  transactionId: string,
  input: WriteInput,
): OccurrenceLink {
  return write(db, { source: input.source, at: input.at }, (tx) => {
    const plan = requireWritablePlan(tx, planId);
    requireDueDate(plan, dueDate);
    if (existingLink(tx, planId, dueDate)) {
      throw new ServiceError("occurrence_taken", 409);
    }
    const txn = tx.select().from(transactions).where(eq(transactions.id, transactionId)).get();
    if (!txn) {
      throw new ServiceError("transaction_not_found", 404);
    }
    if (txn.accountId !== plan.accountId) {
      throw new ServiceError("plan_fields_invalid", 400, { field: "transactionId" });
    }
    const used = tx.select().from(occurrenceLinks).where(eq(occurrenceLinks.transactionId, transactionId)).get();
    if (used) {
      throw new ServiceError("transaction_already_linked", 409);
    }
    const row: OccurrenceLinkRow = {
      id: crypto.randomUUID(),
      planId,
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
    applyLinkedPlan(tx, plan, transactionId, true);
    tx.update(transactions).set({ editedAt: input.at ?? utcNow() }).where(eq(transactions.id, transactionId)).run();
    return row;
  });
}

export function unlinkOccurrence(db: Db, planId: string, dueDate: string, input: WriteInput): OccurrenceLink {
  return write(db, { source: input.source, at: input.at }, (tx) => {
    requireWritablePlan(tx, planId);
    const link = existingLink(tx, planId, dueDate);
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
  planId: string,
  dueDate: string,
  reason: string,
  input: WriteInput,
): OccurrenceLink {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new ServiceError("plan_fields_invalid", 400, { field: "reason" });
  }
  return write(db, { source: input.source, at: input.at }, (tx) => {
    const plan = requireWritablePlan(tx, planId);
    requireDueDate(plan, dueDate);
    if (existingLink(tx, planId, dueDate)) {
      throw new ServiceError("occurrence_taken", 409);
    }
    const row: OccurrenceLinkRow = {
      id: crypto.randomUUID(),
      planId,
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

export function restoreSkip(db: Db, planId: string, dueDate: string, input: WriteInput): OccurrenceLink {
  return write(db, { source: input.source, at: input.at }, (tx) => {
    requireWritablePlan(tx, planId);
    const link = existingLink(tx, planId, dueDate);
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
