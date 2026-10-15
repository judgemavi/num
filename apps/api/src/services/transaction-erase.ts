import { importRows, inboxDecisions, lineTags, occurrenceLinks, transactionLines, transactions, type TransactionRow } from "@num/db";
import { eq, inArray } from "drizzle-orm";
import { ServiceError } from "../service-error";
import { clearRefundLinks } from "./refund-link";
import { loadLines, replaceLines } from "./transaction-lines";
import { auditTransaction, automaticPair, readTransaction, toTransaction } from "./transaction-record";
import type { WriteTx } from "./write";

function deleteOccurrenceLinks(tx: WriteTx, transactionId: string): void {
  const links = tx.select().from(occurrenceLinks).where(eq(occurrenceLinks.transactionId, transactionId)).all();
  for (const link of links) {
    tx.delete(occurrenceLinks).where(eq(occurrenceLinks.id, link.id)).run();
    tx.audit({
      entity: "occurrence_links",
      entityId: link.id,
      action: "delete",
      before: {
        planId: link.planId,
        dueDate: link.dueDate,
        transactionId: link.transactionId,
        skipped: link.skipped,
        reason: link.reason,
      },
      after: null,
    });
  }
}

function deleteInboxDecisions(tx: WriteTx, ids: readonly string[]): void {
  if (ids.length === 0) {
    return;
  }
  const rows = tx
    .select()
    .from(inboxDecisions)
    .all()
    .filter((row) => ids.some((id) => row.itemKey.includes(id)));
  for (const row of rows) {
    tx.delete(inboxDecisions).where(eq(inboxDecisions.itemKey, row.itemKey)).run();
    tx.audit({
      entity: "inbox_decisions",
      entityId: row.itemKey,
      action: "delete",
      before: row,
      after: null,
    });
  }
}

export function eraseTransaction(tx: WriteTx, id: string): void {
  const lineIds = tx
    .select({ id: transactionLines.id })
    .from(transactionLines)
    .where(eq(transactionLines.transactionId, id))
    .all()
    .map((line) => line.id);
  clearRefundLinks(tx, id);
  deleteOccurrenceLinks(tx, id);
  deleteInboxDecisions(tx, [id, ...lineIds]);
  if (lineIds.length > 0) {
    tx.delete(lineTags).where(inArray(lineTags.lineId, lineIds)).run();
    tx.delete(transactionLines).where(eq(transactionLines.transactionId, id)).run();
  }
  tx.update(importRows).set({ transactionId: null }).where(eq(importRows.transactionId, id)).run();
  tx.update(transactions).set({ transferPeerId: null }).where(eq(transactions.transferPeerId, id)).run();
  tx.update(transactions).set({ transferPeerId: null, importRowId: null }).where(eq(transactions.id, id)).run();
  tx.delete(transactions).where(eq(transactions.id, id)).run();
}

function unlinkPeer(tx: WriteTx, sourceId: string, peer: TransactionRow, at: string): void {
  const peerLines = loadLines(tx, peer.id);
  const before = toTransaction(tx, peer, peerLines);
  tx.update(transactions).set({ transferPeerId: null }).where(eq(transactions.id, sourceId)).run();
  tx.update(transactions)
    .set({ transferPeerId: null, autoReason: null, autoSourceId: null, autoConfidence: null, ...(automaticPair(peer) ? {} : { editedAt: at }) })
    .where(eq(transactions.id, peer.id))
    .run();
  replaceLines(
    tx,
    peer.id,
    peerLines.map((line) => ({
      amount: line.amount,
      memo: line.memo,
      categoryId: line.transferAccountId ? null : line.categoryId,
      transferAccountId: null,
      tagIds: line.tagIds,
    })),
  );
  auditTransaction(tx, peer.id, "update", before, readTransaction(tx, peer.id));
}

/** Deletes one transaction. A mirror peer is deleted with it. A non-mirror peer is unlinked. */
export function removeTransaction(tx: WriteTx, id: string, at: string) {
  const existing = tx.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!existing) {
    throw new ServiceError("transaction_not_found", 404);
  }
  const peer = existing.transferPeerId
    ? tx.select().from(transactions).where(eq(transactions.id, existing.transferPeerId)).get()
    : undefined;
  const before = toTransaction(tx, existing, loadLines(tx, existing.id));
  if (peer?.mirror) {
    const peerBefore = toTransaction(tx, peer, loadLines(tx, peer.id));
    tx.update(transactions).set({ transferPeerId: null }).where(eq(transactions.id, existing.id)).run();
    tx.update(transactions).set({ transferPeerId: null }).where(eq(transactions.id, peer.id)).run();
    eraseTransaction(tx, peer.id);
    auditTransaction(tx, peer.id, "delete", peerBefore, null);
  } else if (peer) {
    unlinkPeer(tx, existing.id, peer, at);
  }
  eraseTransaction(tx, existing.id);
  auditTransaction(tx, existing.id, "delete", before, null);
  return before;
}
