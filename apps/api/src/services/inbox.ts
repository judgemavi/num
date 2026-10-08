import type { Inbox, InboxItem } from "@num/shared";
import type { Db } from "../db";
import { decidedKeys } from "./inbox-decisions";
import { collectInbox } from "./inbox-collect";
import { uncategorizedInbox } from "./inbox-uncategorized";

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

export function listInbox(db: Db, asOf: string): Inbox {
  const collected = collectInbox(db, asOf);
  const hidden = decidedKeys(db);
  const items = [...collected.items.filter((item) => !hidden.has(item.itemKey)), ...uncategorizedInbox(db, hidden)].sort(compareItems);
  return {
    asOf,
    count: items.length,
    staleImportDays: collected.staleImportDays,
    items,
    imports: collected.imports,
  };
}
