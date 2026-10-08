import { importBatches, inboxDecisions } from "@num/db";
import { utcNow, type InboxDecision, type InboxDecisionCode, type InboxItem } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { readUnreadable } from "./import-read";
import { collectInbox } from "./inbox-collect";
import { uncategorizedInbox } from "./inbox-uncategorized";
import { write, type AuditSource } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

const codeForKind: Partial<Record<InboxItem["kind"], InboxDecisionCode>> = {
  transfer_pair: "not_transfer",
  recurring_changed: "keep_plan_amount",
  plan_proposal: "not_recurring",
  paycheck_funding: "keep_unassigned",
  import_unreadable: "not_a_transaction",
};

export function decisionRows(db: Db): InboxDecision[] {
  return db
    .select()
    .from(inboxDecisions)
    .all()
    .map((row) => ({
      itemKey: row.itemKey,
      decision: row.decision as InboxDecisionCode,
      reason: row.reason,
      decidedAt: row.decidedAt,
    }));
}

export function decidedKeys(db: Db): Set<string> {
  return new Set(decisionRows(db).map((row) => row.itemKey));
}

function itemKind(itemKey: string): string {
  const split = itemKey.indexOf(":");
  return split === -1 ? itemKey : itemKey.slice(0, split);
}

function openKeys(db: Db, asOf: string): Set<string> {
  const hidden = decidedKeys(db);
  const collected = collectInbox(db, asOf);
  const keys = new Set<string>();
  for (const item of collected.items) {
    if (!hidden.has(item.itemKey)) {
      keys.add(item.itemKey);
    }
  }
  for (const item of uncategorizedInbox(db, hidden)) {
    keys.add(item.itemKey);
  }
  return keys;
}

export function decideInboxItem(
  db: Db,
  asOf: string,
  itemKey: string,
  decision: InboxDecisionCode,
  input: WriteInput,
): InboxDecision {
  const kind = itemKind(itemKey);
  if (codeForKind[kind as InboxItem["kind"]] !== decision) {
    throw new ServiceError("invalid_body", 400, { field: "decision" });
  }
  if (!openKeys(db, asOf).has(itemKey)) {
    throw new ServiceError("inbox_item_not_found", 404);
  }
  const at = input.at ?? utcNow();
  const row = { itemKey, decision, reason: null, decidedAt: at };
  write(db, { source: input.source, at }, (tx) => {
    tx.insert(inboxDecisions).values(row).run();
    tx.audit({
      entity: "inbox_decisions",
      entityId: itemKey,
      action: "create",
      before: null,
      after: row,
    });
  });
  return row;
}

export function undoInboxDecision(db: Db, itemKey: string, input: WriteInput): { itemKey: string } {
  const row = db.select().from(inboxDecisions).where(eq(inboxDecisions.itemKey, itemKey)).get();
  if (!row) {
    throw new ServiceError("decision_not_found", 404);
  }
  write(db, { source: input.source, at: input.at }, (tx) => {
    tx.delete(inboxDecisions).where(eq(inboxDecisions.itemKey, itemKey)).run();
    tx.audit({
      entity: "inbox_decisions",
      entityId: itemKey,
      action: "delete",
      before: row,
      after: null,
    });
  });
  return { itemKey };
}

function unreadableParts(itemKey: string): { batchId: string; line: number } | null {
  const prefix = "import_unreadable:";
  if (!itemKey.startsWith(prefix)) {
    return null;
  }
  const rest = itemKey.slice(prefix.length);
  const split = rest.lastIndexOf(":");
  if (split <= 0) {
    return null;
  }
  const line = Number(rest.slice(split + 1));
  if (!Number.isInteger(line) || line < 0) {
    return null;
  }
  return { batchId: rest.slice(0, split), line };
}

export function acceptUnreadableLine(db: Db, asOf: string, itemKey: string, input: WriteInput): { itemKey: string } {
  const parts = unreadableParts(itemKey);
  if (!parts || !openKeys(db, asOf).has(itemKey)) {
    throw new ServiceError("inbox_item_not_found", 404);
  }
  const batch = db.select().from(importBatches).where(eq(importBatches.id, parts.batchId)).get();
  if (!batch) {
    throw new ServiceError("inbox_item_not_found", 404);
  }
  const rows = readUnreadable(batch.unreadableJson);
  const next = rows.filter((row) => row.line !== parts.line);
  if (next.length === rows.length) {
    throw new ServiceError("inbox_item_not_found", 404);
  }
  const at = input.at ?? utcNow();
  write(db, { source: input.source, at }, (tx) => {
    tx.update(importBatches).set({ unreadableJson: JSON.stringify(next) }).where(eq(importBatches.id, batch.id)).run();
    tx.audit({
      entity: "import_batches",
      entityId: batch.id,
      action: "update",
      before: { unreadableJson: batch.unreadableJson },
      after: { unreadableJson: JSON.stringify(next) },
    });
  });
  return { itemKey };
}
