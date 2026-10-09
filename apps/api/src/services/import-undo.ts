import { auditLog, importBatches, importRows, occurrenceLinks, transactions } from "@num/db";
import { utcNow, type ImportUndo, type UndoBlockReason } from "@num/shared";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { presentBatch } from "./import-read";
import { auditTransaction, readTransaction, type TxRow } from "./transaction-record";
import { write, type AuditSource, type WriteTx } from "./write";

function editedAfterImport(db: Db, transactionId: string): boolean {
  const rows = db
    .select({ action: auditLog.action })
    .from(auditLog)
    .where(and(eq(auditLog.entity, "transactions"), eq(auditLog.entityId, transactionId)))
    .orderBy(sql`rowid`)
    .all();
  const created = rows.findIndex((row) => row.action === "create");
  if (created < 0) {
    return true;
  }
  return rows.slice(created + 1).some((row) => row.action === "update");
}

function removeMirror(tx: WriteTx, sourceId: string, at: string): void {
  const source = tx.select().from(transactions).where(eq(transactions.id, sourceId)).get();
  if (!source?.transferPeerId) {
    return;
  }
  const peer = tx.select().from(transactions).where(eq(transactions.id, source.transferPeerId)).get();
  if (!peer || peer.deletedAt || !peer.mirror) {
    return;
  }
  const before = readTransaction(tx, peer.id);
  tx.update(transactions).set({ transferPeerId: null, deletedAt: at }).where(eq(transactions.id, peer.id)).run();
  tx.update(transactions).set({ transferPeerId: null }).where(eq(transactions.id, sourceId)).run();
  auditTransaction(tx, peer.id, "delete", before, readTransaction(tx, peer.id));
}

function blockReason(txn: TxRow | undefined, db: Db): UndoBlockReason | "removed" | null {
  if (!txn || txn.deletedAt !== null) {
    return "removed";
  }
  if (txn.status === "reconciled") {
    return "reconciled";
  }
  if (editedAfterImport(db, txn.id)) {
    return "edited";
  }
  return null;
}

function clearOccurrenceLinks(tx: WriteTx, transactionId: string): void {
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
      const reason = blockReason(txn, db);
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
      const before = readTransaction(tx, row.transactionId);
      clearOccurrenceLinks(tx, row.transactionId);
      removeMirror(tx, row.transactionId, at);
      tx.update(transactions).set({ deletedAt: at }).where(eq(transactions.id, row.transactionId)).run();
      tx.update(importRows).set({ active: false }).where(eq(importRows.id, row.id)).run();
      auditTransaction(tx, row.transactionId, "delete", before, readTransaction(tx, row.transactionId));
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
          tx.update(transactions).set({ importRowId: null }).where(eq(transactions.id, current.id)).run();
          auditTransaction(tx, current.id, "update", before, readTransaction(tx, current.id));
        }
      }
      tx.update(importRows).set({ active: false, transactionId: null }).where(eq(importRows.id, row.id)).run();
    }
    for (const rowId of dropIds) {
      const row = tx.select().from(importRows).where(eq(importRows.id, rowId)).get();
      if (row?.transactionId) {
        clearOccurrenceLinks(tx, row.transactionId);
      }
      tx.update(importRows).set({ active: false }).where(eq(importRows.id, rowId)).run();
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
