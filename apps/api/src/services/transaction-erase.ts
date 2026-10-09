import { bucketEvents, fundingRuns, importRows, lineTags, occurrenceLinks, transactionLines, transactions } from "@num/db";
import { eq, inArray } from "drizzle-orm";
import type { WriteTx } from "./write";

export function eraseTransaction(tx: WriteTx, id: string): void {
  const lines = tx
    .select({ id: transactionLines.id })
    .from(transactionLines)
    .where(eq(transactionLines.transactionId, id))
    .all();
  if (lines.length > 0) {
    tx.delete(lineTags)
      .where(
        inArray(
          lineTags.lineId,
          lines.map((line) => line.id),
        ),
      )
      .run();
    tx.delete(transactionLines).where(eq(transactionLines.transactionId, id)).run();
  }
  tx.update(importRows).set({ transactionId: null }).where(eq(importRows.transactionId, id)).run();
  tx.update(transactions).set({ refundOfId: null }).where(eq(transactions.refundOfId, id)).run();
  tx.update(transactions).set({ transferPeerId: null }).where(eq(transactions.transferPeerId, id)).run();
  const links = tx.select().from(occurrenceLinks).where(eq(occurrenceLinks.transactionId, id)).all();
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
  const runs = tx.select().from(fundingRuns).where(eq(fundingRuns.incomeTransactionId, id)).all();
  for (const run of runs) {
    tx.update(bucketEvents).set({ fundingRunId: null }).where(eq(bucketEvents.fundingRunId, run.id)).run();
    tx.delete(fundingRuns).where(eq(fundingRuns.id, run.id)).run();
    tx.audit({
      entity: "funding_runs",
      entityId: run.id,
      action: "delete",
      before: {
        incomeTransactionId: run.incomeTransactionId,
        date: run.date,
        createdAt: run.createdAt,
        undoneAt: run.undoneAt,
      },
      after: null,
    });
  }
  tx.update(transactions).set({ transferPeerId: null, importRowId: null }).where(eq(transactions.id, id)).run();
  tx.delete(transactions).where(eq(transactions.id, id)).run();
}
