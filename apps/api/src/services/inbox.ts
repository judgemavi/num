import { inboxDismissals } from "@num/db";
import { utcNow, type Inbox, type InboxItem } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { collectInbox } from "./inbox-collect";
import { write, type AuditSource } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

function compareItems(left: InboxItem, right: InboxItem): number {
  const leftDate = left.date ?? "";
  const rightDate = right.date ?? "";
  if (leftDate !== rightDate) {
    return leftDate < rightDate ? 1 : -1;
  }
  if (left.itemKey < right.itemKey) {
    return -1;
  }
  return left.itemKey > right.itemKey ? 1 : 0;
}

export function listInbox(db: Db, asOf: string, dismissed = false): Inbox {
  const collected = collectInbox(db, asOf);
  const dismissalRows = db.select().from(inboxDismissals).all();
  const hidden = new Set(dismissalRows.map((row) => row.itemKey));
  const reason = new Map(dismissalRows.map((row) => [row.itemKey, row.reason]));
  const open = collected.items.filter((item) => !hidden.has(item.itemKey));
  const closed = collected.items.filter((item) => hidden.has(item.itemKey));
  const items = (dismissed ? closed : open).sort(compareItems);
  return {
    asOf,
    count: open.length,
    dismissedCount: closed.length,
    staleImportDays: collected.staleImportDays,
    items,
    imports: collected.imports,
    dismissalReasons: dismissed ? items.map((item) => ({ itemKey: item.itemKey, reason: reason.get(item.itemKey) ?? "" })) : [],
  };
}

export function dismissInboxItem(db: Db, asOf: string, itemKey: string, reason: string, input: WriteInput): { itemKey: string } {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new ServiceError("invalid_body", 400, { field: "reason" });
  }
  const visible = listInbox(db, asOf).items.some((item) => item.itemKey === itemKey);
  if (!visible) {
    throw new ServiceError("inbox_item_not_found", 404);
  }
  const at = input.at ?? utcNow();
  write(db, { source: input.source, at }, (tx) => {
    const row = { itemKey, reason: trimmed, dismissedAt: at };
    tx.insert(inboxDismissals).values(row).run();
    tx.audit({
      entity: "inbox_dismissals",
      entityId: itemKey,
      action: "create",
      before: null,
      after: row,
    });
  });
  return { itemKey };
}

export function restoreInboxItem(db: Db, itemKey: string, input: WriteInput): { itemKey: string } {
  const existing = db.select().from(inboxDismissals).where(eq(inboxDismissals.itemKey, itemKey)).get();
  if (!existing) {
    throw new ServiceError("dismissal_not_found", 404);
  }
  write(db, { source: input.source, at: input.at }, (tx) => {
    tx.delete(inboxDismissals).where(eq(inboxDismissals.itemKey, itemKey)).run();
    tx.audit({
      entity: "inbox_dismissals",
      entityId: itemKey,
      action: "delete",
      before: existing,
      after: null,
    });
  });
  return { itemKey };
}
