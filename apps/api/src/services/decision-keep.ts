import { inboxDecisions, transactionLines, transactions } from "@num/db";
import type { Transaction } from "@num/shared";
import { and, eq, isNull, like, sql } from "drizzle-orm";
import { auditTransaction, readTransaction } from "./transaction-record";
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
  const row = { itemKey, decision: "keep_uncategorized" as const, decidedAt: at };
  tx.insert(inboxDecisions).values(row).run();
  tx.audit({ entity: "inbox_decisions", entityId: itemKey, action: "create", before: null, after: row });
}

function hasKeep(db: Reader, transactionId: string): boolean {
  return db.select({ key: inboxDecisions.itemKey }).from(inboxDecisions).where(eq(inboxDecisions.itemKey, keepKey(transactionId))).get() !== undefined;
}

/**
 * True when the transaction teaches a learned label: one line, not a mirror, with a category, or with no category and
 * no transfer and the keep decision (decision 0046).
 */
export function teachesLabel(db: Reader, txn: Pick<Transaction, "id" | "mirror" | "lines">): boolean {
  const line = txn.lines[0];
  if (txn.mirror || txn.lines.length !== 1 || !line || line.transferAccountId !== null) {
    return false;
  }
  return line.categoryId !== null || hasKeep(db, txn.id);
}

/**
 * The answer "no category" (decision 0046): records the keep decision and removes the automatic fields of an automatic
 * "no category". The caller makes sure that the transaction is uncategorized.
 */
export function answerNoCategory(tx: WriteTx, transactionId: string, at: string): void {
  recordKeep(tx, transactionId, at);
  const row = tx.select({ autoReason: transactions.autoReason }).from(transactions).where(eq(transactions.id, transactionId)).get();
  if (!row || row.autoReason === null) {
    return;
  }
  const before = readTransaction(tx, transactionId);
  tx.update(transactions)
    .set({ autoReason: null, autoSourceId: null, autoConfidence: null, editedAt: at })
    .where(eq(transactions.id, transactionId))
    .run();
  auditTransaction(tx, transactionId, "update", before, readTransaction(tx, transactionId));
}

/** Removes the keep decisions of transactions that have a category or a transfer in every line. */
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
