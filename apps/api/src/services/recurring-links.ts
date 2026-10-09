import { occurrenceLinks, recurringPlans, transactions } from "@num/db";
import { occurrenceDates, type OccurrenceLink, type PlanSchedule } from "@num/shared";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { applyLinkedPlan } from "./match-apply";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

type PlanRow = typeof recurringPlans.$inferSelect;
type LinkRow = typeof occurrenceLinks.$inferSelect;

function scheduleOf(row: PlanRow): PlanSchedule {
  return {
    startDate: row.startDate,
    endDate: row.endDate,
    freq: row.freq as PlanSchedule["freq"],
    interval: row.interval,
    monthDay: row.monthDay,
    businessDayShift: row.businessDayShift as PlanSchedule["businessDayShift"],
  };
}

function requireDueDate(row: PlanRow, dueDate: string) {
  const found = occurrenceDates(scheduleOf(row), dueDate).find((item) => item.dueDate === dueDate);
  if (!found) {
    throw new ServiceError("occurrence_not_found", 404);
  }
  return found;
}

function toLink(row: LinkRow): OccurrenceLink {
  return {
    id: row.id,
    planId: row.planId,
    dueDate: row.dueDate,
    transactionId: row.transactionId,
    skipped: row.skipped,
    reason: row.reason,
  };
}

function linkSnapshot(row: LinkRow) {
  return {
    planId: row.planId,
    dueDate: row.dueDate,
    transactionId: row.transactionId,
    skipped: row.skipped,
    reason: row.reason,
  };
}

function requireWritablePlan(tx: WriteTx, id: string): PlanRow {
  const row = tx.select().from(recurringPlans).where(eq(recurringPlans.id, id)).get();
  if (!row) {
    throw new ServiceError("plan_not_found", 404);
  }
  if (row.archivedAt) {
    throw new ServiceError("plan_archived", 409);
  }
  return row;
}

function existingLink(tx: WriteTx, planId: string, dueDate: string): LinkRow | undefined {
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
  let linked: OccurrenceLink | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
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
    const row: LinkRow = {
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
      after: linkSnapshot(row),
    });
    applyLinkedPlan(tx, plan, transactionId);
    linked = toLink(row);
  });
  if (!linked) {
    throw new Error("Link did not return an occurrence");
  }
  return linked;
}

export function unlinkOccurrence(db: Db, planId: string, dueDate: string, input: WriteInput): OccurrenceLink {
  let removed: OccurrenceLink | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
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
      before: linkSnapshot(link),
      after: null,
    });
    removed = toLink(link);
  });
  if (!removed) {
    throw new Error("Unlink did not return an occurrence");
  }
  return removed;
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
  let skipped: OccurrenceLink | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
    const plan = requireWritablePlan(tx, planId);
    requireDueDate(plan, dueDate);
    if (existingLink(tx, planId, dueDate)) {
      throw new ServiceError("occurrence_taken", 409);
    }
    const row: LinkRow = {
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
      after: linkSnapshot(row),
    });
    skipped = toLink(row);
  });
  if (!skipped) {
    throw new Error("Skip did not return an occurrence");
  }
  return skipped;
}

export function restoreSkip(db: Db, planId: string, dueDate: string, input: WriteInput): OccurrenceLink {
  let restored: OccurrenceLink | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
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
      before: linkSnapshot(link),
      after: null,
    });
    restored = toLink(link);
  });
  if (!restored) {
    throw new Error("Restore did not return an occurrence");
  }
  return restored;
}
