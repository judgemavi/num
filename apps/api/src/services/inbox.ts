import { inboxDismissals } from "@num/db";
import { utcNow, type Inbox, type InboxItem } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { collectInbox } from "./inbox-collect";
import { uncategorizedInbox } from "./inbox-uncategorized";
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
  const groups = uncategorizedInbox(db, hidden);
  const open = [...collected.items.filter((item) => !hidden.has(item.itemKey)), ...groups.open];
  const closed = [...collected.items.filter((item) => hidden.has(item.itemKey)), ...groups.closed];
  const items = (dismissed ? closed : open).sort(compareItems);
  return {
    asOf,
    count: open.length,
    dismissedCount: closed.length,
    staleImportDays: collected.staleImportDays,
    items,
    imports: collected.imports,
    dismissalReasons: dismissed
      ? items.map((item) => ({
          itemKey: item.itemKey,
          reason: reason.get(item.itemKey) ?? "",
        }))
      : [],
  };
}

function visibleKeys(db: Db, asOf: string): Set<string> {
  const keys = new Set<string>();
  for (const item of listInbox(db, asOf).items) {
    keys.add(item.itemKey);
  }
  return keys;
}

export function dismissInboxItems(db: Db, asOf: string, itemKeys: string[], reason: string, input: WriteInput): { itemKeys: string[] } {
  const trimmed = reason.trim();
  if (trimmed.length === 0 || itemKeys.length === 0) {
    throw new ServiceError("invalid_body", 400, { field: "reason" });
  }
  const visible = visibleKeys(db, asOf);
  if (itemKeys.some((key) => !visible.has(key))) {
    throw new ServiceError("inbox_item_not_found", 404);
  }
  const at = input.at ?? utcNow();
  write(db, { source: input.source, at }, (tx) => {
    for (const itemKey of itemKeys) {
      const row = { itemKey, reason: trimmed, dismissedAt: at };
      tx.insert(inboxDismissals).values(row).run();
      tx.audit({
        entity: "inbox_dismissals",
        entityId: itemKey,
        action: "create",
        before: null,
        after: row,
      });
    }
  });
  return { itemKeys };
}

export function restoreInboxItems(db: Db, itemKeys: string[], input: WriteInput): { itemKeys: string[] } {
  const existing = itemKeys.map((itemKey) => {
    const row = db.select().from(inboxDismissals).where(eq(inboxDismissals.itemKey, itemKey)).get();
    if (!row) {
      throw new ServiceError("dismissal_not_found", 404);
    }
    return row;
  });
  write(db, { source: input.source, at: input.at }, (tx) => {
    for (const row of existing) {
      tx.delete(inboxDismissals).where(eq(inboxDismissals.itemKey, row.itemKey)).run();
      tx.audit({
        entity: "inbox_dismissals",
        entityId: row.itemKey,
        action: "delete",
        before: row,
        after: null,
      });
    }
  });
  return { itemKeys };
}
