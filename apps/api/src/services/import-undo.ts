import { importBatches, importRows, transactions } from "@num/db";
import { utcNow, type ImportUndo, type UndoBlockReason } from "@num/shared";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { presentBatch } from "./import-read";
import { transactionReconciled } from "./reconciled";
import { hasActiveFundingRun, removeTransaction } from "./transaction-erase";
import { auditTransaction, readTransaction, type TxRow } from "./transaction-record";
import { write, type AuditSource } from "./write";

function blockReason(db: Db, txn: TxRow | undefined): UndoBlockReason | "removed" | null {
  if (!txn) {
    return "removed";
  }
  if (transactionReconciled(db, txn.accountId, txn.date)) {
    return "reconciled";
  }
  if (txn.transferPeerId) {
    const peer = db.select().from(transactions).where(eq(transactions.id, txn.transferPeerId)).get();
    if (peer && transactionReconciled(db, peer.accountId, peer.date)) {
      return "reconciled";
    }
  }
  if (txn.editedAt !== null || hasActiveFundingRun(db, txn.id)) {
    return "edited";
  }
  return null;
}

export function undoImportBatch(db: Db, id: string, input: { source: AuditSource; at?: string }): ImportUndo {
  const batch = db.select().from(importBatches).where(eq(importBatches.id, id)).get();
  if (!batch) {
    throw new ServiceError("import_not_found", 404);
  }
  if (batch.undoneAt) {
    return { batch: presentBatch(db, batch), blocked: [] };
  }

  const rows = db.select().from(importRows).where(eq(importRows.batchId, id)).all();
  const blocked: ImportUndo["blocked"] = [];
  const removeIds: string[] = [];
  const unlinkIds: string[] = [];
  const dropIds: string[] = [];

  for (const row of rows) {
    if (!row.active || row.outcome === "duplicate") {
      continue;
    }
    if (row.outcome === "created") {
      const txn = row.transactionId
        ? db.select().from(transactions).where(eq(transactions.id, row.transactionId)).get()
        : undefined;
      const reason = blockReason(db, txn);
      if (reason === "removed") {
        dropIds.push(row.id);
      } else if (reason) {
        blocked.push({
          rowIndex: row.rowIndex,
          date: row.date,
          amount: row.amount,
          payeeRaw: row.payeeRaw,
          reason,
        });
      } else {
        removeIds.push(row.id);
      }
      continue;
    }
    if (row.outcome === "matched") {
      unlinkIds.push(row.id);
      continue;
    }
    dropIds.push(row.id);
  }

  if (removeIds.length === 0 && unlinkIds.length === 0 && dropIds.length === 0) {
    return { batch: presentBatch(db, batch), blocked };
  }

  const at = input.at ?? utcNow();
  write(db, { source: input.source, at }, (tx) => {
    for (const rowId of removeIds) {
      const row = tx.select().from(importRows).where(eq(importRows.id, rowId)).get();
      if (!row?.transactionId) {
        continue;
      }
      tx.update(importRows).set({ active: false, transactionId: null }).where(eq(importRows.id, row.id)).run();
      removeTransaction(tx, row.transactionId, at);
    }
    for (const rowId of unlinkIds) {
      const row = tx.select().from(importRows).where(eq(importRows.id, rowId)).get();
      if (!row) {
        continue;
      }
      if (row.transactionId) {
        const current = tx.select().from(transactions).where(eq(transactions.id, row.transactionId)).get();
        if (current) {
          const before = readTransaction(tx, current.id);
          tx.update(transactions).set({ importRowId: null, status: row.previousStatus ?? current.status }).where(eq(transactions.id, current.id)).run();
          auditTransaction(tx, current.id, "update", before, readTransaction(tx, current.id));
        }
      }
      tx.update(importRows).set({ active: false, transactionId: null }).where(eq(importRows.id, row.id)).run();
    }
    for (const rowId of dropIds) {
      tx.update(importRows).set({ active: false, transactionId: null }).where(eq(importRows.id, rowId)).run();
    }
    const stillActive = tx
      .select({ id: importRows.id })
      .from(importRows)
      .where(
        and(eq(importRows.batchId, id), eq(importRows.active, true), sql`${importRows.outcome} <> 'duplicate'`),
      )
      .all();
    const undoneAt = stillActive.length === 0 ? at : null;
    if (undoneAt) {
      tx.update(importBatches).set({ undoneAt }).where(eq(importBatches.id, id)).run();
    }
    const next = tx.select().from(importBatches).where(eq(importBatches.id, id)).get();
    if (!next) {
      throw new Error("Import batch is missing");
    }
    tx.audit({
      entity: "import_batches",
      entityId: id,
      action: "undo",
      before: { undoneAt: batch.undoneAt },
      after: { undoneAt: next.undoneAt, blocked: blocked.length },
    });
  });

  const next = db.select().from(importBatches).where(eq(importBatches.id, id)).get();
  if (!next) {
    throw new ServiceError("import_not_found", 404);
  }
  return { batch: presentBatch(db, next), blocked };
}
