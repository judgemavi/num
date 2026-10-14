import { inboxDecisions, transactionLines } from "@num/db";
import { and, eq, isNull, like, sql } from "drizzle-orm";
import { hasNoOpenLine } from "./transaction-sql";
import type { Reader, WriteTx } from "./write";

export const keepPrefix = "uncategorized:";

export function keepKey(transactionId: string): string {
  return `${keepPrefix}${transactionId}`;
}

/** True when a line of the transaction has no category and no transfer. This is the Needs review rule. */
export function isUncategorized(db: Reader, transactionId: string): boolean {
  const open = db
    .select({ id: transactionLines.id })
    .from(transactionLines)
    .where(
      and(
        eq(transactionLines.transactionId, transactionId),
        isNull(transactionLines.categoryId),
        isNull(transactionLines.transferAccountId),
      ),
    )
    .limit(1)
    .get();
  return open !== undefined;
}

/** Records the decision to keep a transaction without a category. It does nothing when the decision exists. */
export function recordKeep(tx: WriteTx, transactionId: string, at: string): void {
  const itemKey = keepKey(transactionId);
  if (tx.select().from(inboxDecisions).where(eq(inboxDecisions.itemKey, itemKey)).get()) {
    return;
  }
  const row = { itemKey, decision: "keep_uncategorized" as const, reason: null, decidedAt: at };
  tx.insert(inboxDecisions).values(row).run();
  tx.audit({ entity: "inbox_decisions", entityId: itemKey, action: "create", before: null, after: row });
}

/** Removes the keep decisions of transactions that have a category, a transfer or a split in every line. */
export function dropSettledKeeps(tx: WriteTx): void {
  const settled = tx
    .select()
    .from(inboxDecisions)
    .where(
      and(
        like(inboxDecisions.itemKey, `${keepPrefix}%`),
        hasNoOpenLine(sql`substr(${inboxDecisions.itemKey}, ${keepPrefix.length + 1})`),
      ),
    )
    .all();
  for (const before of settled) {
    tx.delete(inboxDecisions).where(eq(inboxDecisions.itemKey, before.itemKey)).run();
    tx.audit({ entity: "inbox_decisions", entityId: before.itemKey, action: "delete", before, after: null });
  }
}
