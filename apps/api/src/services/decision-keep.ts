import { inboxDecisions } from "@num/db";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import type { AuditEntry, WriteTx } from "./write";

export const keepPrefix = "uncategorized:";

export function keepKey(transactionId: string): string {
  return `${keepPrefix}${transactionId}`;
}

/** True when a line of the transaction has no category and no transfer. This is the Needs review rule. */
export function isUncategorized(db: Db | WriteTx, transactionId: string): boolean {
  const [row] = db.all<{ open: number }>(sql`
    select exists (
      select 1 from transaction_lines l
      where l.transaction_id = ${transactionId} and l.category_id is null and l.transfer_account_id is null
    ) as open
  `);
  return Number(row?.open) === 1;
}

/** Records the decision to keep a transaction without a category. It does nothing when the decision exists. */
export function recordKeep(tx: WriteTx, transactionId: string, at: string): void {
  const itemKey = keepKey(transactionId);
  if (tx.select().from(inboxDecisions).where(eq(inboxDecisions.itemKey, itemKey)).get()) {
    return;
  }
  const row = { itemKey, decision: "keep_uncategorized", reason: null, decidedAt: at };
  tx.insert(inboxDecisions).values(row).run();
  tx.audit({ entity: "inbox_decisions", entityId: itemKey, action: "create", before: null, after: row });
}

/** Removes the keep decisions of transactions that have a category, a transfer or a split in every line. */
export function dropSettledKeeps(tx: WriteTx): void {
  const settled = tx.all<{ itemKey: string }>(sql`
    select d.item_key as itemKey from inbox_decisions d
    where d.item_key like ${`${keepPrefix}%`}
      and not exists (
        select 1 from transaction_lines l
        where l.transaction_id = substr(d.item_key, ${keepPrefix.length + 1})
          and l.category_id is null and l.transfer_account_id is null
      )
  `);
  for (const { itemKey } of settled) {
    const before = tx.select().from(inboxDecisions).where(eq(inboxDecisions.itemKey, itemKey)).get();
    tx.delete(inboxDecisions).where(eq(inboxDecisions.itemKey, itemKey)).run();
    const entry: AuditEntry = { entity: "inbox_decisions", entityId: itemKey, action: "delete", before, after: null };
    tx.audit(entry);
  }
}
