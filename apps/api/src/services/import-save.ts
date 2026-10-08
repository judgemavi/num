import { accounts, importBatches, importRows, transactionLines, transactions } from "@num/db";
import type { ColumnMap, ImportBatch, UnreadableRow } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { accountAuditSnapshot } from "./account-snapshot";
import { countOutcomes, presentBatch } from "./import-read";
import type { PlannedImportRow } from "./import-plan";
import { auditTransaction, readTransaction } from "./transaction-record";
import { write, type AuditSource, type WriteTx } from "./write";

type SaveInput = {
  source: AuditSource;
  at: string;
  accountId: string;
  documentId: string;
  parser: "ofx" | "csv";
  rows: PlannedImportRow[];
  closingBalance: number | null;
  closingDate: string | null;
  unreadable: UnreadableRow[];
  presetId: string | null;
  columnMap: ColumnMap | null;
};

function insertCreated(tx: WriteTx, batchId: string, accountId: string, row: PlannedImportRow): void {
  const rowId = crypto.randomUUID();
  const transactionId = crypto.randomUUID();
  tx.insert(importRows)
    .values({
      id: rowId,
      batchId,
      accountId,
      rowIndex: row.rowIndex,
      date: row.date,
      amount: row.amount,
      payeeRaw: row.payeeRaw,
      bankId: row.bankId,
      identity: row.identity,
      outcome: "created",
      transactionId: null,
      active: true,
    })
    .run();
  tx.insert(transactions)
    .values({
      id: transactionId,
      accountId,
      date: row.date,
      amount: row.amount,
      merchantId: null,
      notes: null,
      payeeRaw: row.payeeRaw,
      status: "open",
      source: "import",
      importRowId: rowId,
      transferPeerId: null,
      deletedAt: null,
    })
    .run();
  tx.insert(transactionLines)
    .values({
      id: crypto.randomUUID(),
      transactionId,
      amount: row.amount,
      memo: null,
      categoryId: null,
      transferAccountId: null,
    })
    .run();
  tx.update(importRows).set({ transactionId }).where(eq(importRows.id, rowId)).run();
  auditTransaction(tx, transactionId, "create", null, readTransaction(tx, transactionId));
}

function insertMatched(tx: WriteTx, batchId: string, accountId: string, row: PlannedImportRow): void {
  if (!row.transactionId) {
    throw new Error("A matched row needs a transaction");
  }
  const rowId = crypto.randomUUID();
  const before = readTransaction(tx, row.transactionId);
  tx.insert(importRows)
    .values({
      id: rowId,
      batchId,
      accountId,
      rowIndex: row.rowIndex,
      date: row.date,
      amount: row.amount,
      payeeRaw: row.payeeRaw,
      bankId: row.bankId,
      identity: row.identity,
      outcome: "matched",
      transactionId: row.transactionId,
      active: true,
    })
    .run();
  tx.update(transactions).set({ importRowId: rowId }).where(eq(transactions.id, row.transactionId)).run();
  auditTransaction(tx, row.transactionId, "update", before, readTransaction(tx, row.transactionId));
}

function insertPlain(tx: WriteTx, batchId: string, accountId: string, row: PlannedImportRow): void {
  tx.insert(importRows)
    .values({
      id: crypto.randomUUID(),
      batchId,
      accountId,
      rowIndex: row.rowIndex,
      date: row.date,
      amount: row.amount,
      payeeRaw: row.payeeRaw,
      bankId: row.bankId,
      identity: row.identity,
      outcome: row.outcome,
      transactionId: null,
      active: row.outcome !== "duplicate",
    })
    .run();
}

function saveFormat(
  tx: WriteTx,
  accountId: string,
  presetId: string | null,
  columnMap: ColumnMap | null,
): void {
  const existing = tx.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!existing || existing.importPreset !== null || existing.columnMap !== null) {
    return;
  }
  const next = {
    importPreset: presetId ?? existing.importPreset,
    columnMap: columnMap ? JSON.stringify(columnMap) : existing.columnMap,
  };
  if (next.importPreset === existing.importPreset && next.columnMap === existing.columnMap) {
    return;
  }
  tx.update(accounts).set(next).where(eq(accounts.id, accountId)).run();
  tx.audit({
    entity: "accounts",
    entityId: accountId,
    action: "update",
    before: accountAuditSnapshot(existing),
    after: accountAuditSnapshot({ ...existing, ...next }),
  });
}

export function saveImportBatch(db: Db, input: SaveInput): ImportBatch {
  const dates = input.rows.map((row) => row.date).sort();
  const periodStart = dates[0];
  const periodEnd = dates[dates.length - 1];
  if (!periodStart || !periodEnd) {
    throw new Error("A batch needs a statement row");
  }
  const batchId = crypto.randomUUID();
  let saved: ImportBatch | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
    tx.insert(importBatches)
      .values({
        id: batchId,
        accountId: input.accountId,
        documentId: input.documentId,
        proposalId: null,
        parser: input.parser,
        periodStart,
        periodEnd,
        closingBalance: input.closingBalance,
        closingDate: input.closingDate,
        createdAt: input.at,
        undoneAt: null,
      })
      .run();
    for (const row of input.rows) {
      if (row.outcome === "created") {
        insertCreated(tx, batchId, input.accountId, row);
      } else if (row.outcome === "matched") {
        insertMatched(tx, batchId, input.accountId, row);
      } else {
        insertPlain(tx, batchId, input.accountId, row);
      }
    }
    saveFormat(tx, input.accountId, input.presetId, input.columnMap);
    const batch = tx.select().from(importBatches).where(eq(importBatches.id, batchId)).get();
    if (!batch) {
      throw new Error("Import batch is missing");
    }
    const presented = presentBatch(tx, batch, input.unreadable.length);
    tx.audit({
      entity: "import_batches",
      entityId: batchId,
      action: "create",
      before: null,
      after: {
        accountId: batch.accountId,
        documentId: batch.documentId,
        parser: batch.parser,
        periodStart: batch.periodStart,
        periodEnd: batch.periodEnd,
        closingBalance: batch.closingBalance,
        closingDate: batch.closingDate,
        counts: countOutcomes(input.rows, input.unreadable.length),
      },
    });
    saved = presented;
  });
  if (!saved) {
    throw new Error("Import did not return a batch");
  }
  return saved;
}
