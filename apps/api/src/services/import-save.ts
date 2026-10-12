import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { accounts, documents, importBatches, importRows, transactionLines, transactions } from "@num/db";
import { normalizePayee, storedPayee, type ColumnMap, type ImportBatch, type MatchResult, type UnreadableRow } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { accountAuditSnapshot } from "./account-snapshot";
import { countOutcomes, presentBatch } from "./import-read";
import type { PlannedImportRow } from "./import-plan";
import { labelFields, linkRecurring, mortgageSplitLines } from "./match-apply";
import { loadMatchBook, recurringForRows, scorePayee } from "./match-book";
import { insertMirror } from "./transaction-transfer";
import { linkRefundIfSure } from "./refund-auto";
import { auditTransaction, readTransaction } from "./transaction-record";
import { write, type AuditSource, type WriteTx } from "./write";

type DocumentInsert = {
  id: string;
  filename: string;
  hash: string;
  mimeType: string;
  storagePath: string;
  uploadedAt: string;
  deletedAt: string | null;
};

type SaveInput = {
  source: AuditSource;
  at: string;
  accountId: string;
  dataDir: string;
  bytes: Uint8Array | null;
  document: DocumentInsert;
  newFile: boolean;
  restoreDocument: boolean;
  parser: "ofx" | "csv";
  rows: PlannedImportRow[];
  closingBalance: number | null;
  closingDate: string | null;
  unreadable: UnreadableRow[];
  presetId: string | null;
  columnMap: ColumnMap | null;
  asOf: string | null;
};

function scoredLabel(tx: WriteTx, accountId: string, row: PlannedImportRow, result: MatchResult) {
  const payee = storedPayee(row.payeeRaw);
  const mortgage = result.mortgage ? mortgageSplitLines(tx, result, accountId, row.date, row.amount) : null;
  if (result.mortgage && !mortgage) {
    return { payee, applied: labelFields({ ...result, level: "none", mortgage: false }, null), mortgage: null, link: false };
  }
  return { payee, applied: labelFields(result, null), mortgage, link: result.level === "automatic" && result.reason === "recurring" };
}

function insertCreated(
  tx: WriteTx,
  batchId: string,
  accountId: string,
  row: PlannedImportRow,
  result: MatchResult,
  dueDate: string | null,
): string {
  const rowId = crypto.randomUUID();
  const transactionId = crypto.randomUUID();
  const planned = scoredLabel(tx, accountId, row, result);
  const payee = planned.payee;
  const applied = planned.applied;
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
  const categoryId = applied && "categoryId" in applied ? applied.categoryId : null;
  tx.insert(transactions)
    .values({
      id: transactionId,
      accountId,
      date: row.date,
      amount: row.amount,
      merchantId: applied?.merchantId ?? null,
      notes: null,
      payeeRaw: payee.payeeRaw,
      payeeNormalized: payee.payeeNormalized,
      status: "open",
      source: "import",
      importRowId: rowId,
      transferPeerId: null,
      mirror: false,
      autoReason: applied?.autoReason ?? null,
      autoSourceId: applied?.autoSourceId ?? null,
      autoConfidence: applied?.autoConfidence ?? null,
    })
    .run();
  const lines = planned.mortgage ?? [
    { amount: row.amount, memo: null, categoryId, transferAccountId: null, tagIds: [] },
  ];
  for (const line of lines) {
    tx.insert(transactionLines)
      .values({
        id: crypto.randomUUID(),
        transactionId,
        amount: line.amount,
        memo: line.memo,
        categoryId: line.categoryId,
        transferAccountId: line.transferAccountId,
      })
      .run();
  }
  const principal = planned.mortgage?.find((line) => line.transferAccountId);
  if (principal?.transferAccountId) {
    insertMirror(
      tx,
      transactionId,
      {
        accountId,
        date: row.date,
        amount: row.amount,
        merchantId: null,
        notes: null,
        payeeRaw: payee.payeeRaw,
        payeeNormalized: payee.payeeNormalized,
        status: "open",
      },
      "import",
      principal.transferAccountId,
      principal,
      false,
    );
  }
  if (planned.link && dueDate && result.sourceId) {
    linkRecurring(tx, result.sourceId, dueDate, transactionId);
  }
  tx.update(importRows).set({ transactionId }).where(eq(importRows.id, rowId)).run();
  auditTransaction(tx, transactionId, "create", null, readTransaction(tx, transactionId), {
    suggestionReason: result.reason ?? "none",
  });
  return transactionId;
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
  tx.update(transactions).set({ importRowId: rowId, mirror: false }).where(eq(transactions.id, row.transactionId)).run();
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

function writeNewFile(dataDir: string, hash: string, bytes: Uint8Array): void {
  mkdirSync(join(dataDir, "uploads"), { recursive: true });
  writeFileSync(join(dataDir, "uploads", hash), bytes);
}

export function saveImportBatch(db: Db, input: SaveInput): ImportBatch {
  const dates = input.rows.map((row) => row.date).sort();
  const periodStart = dates[0];
  const periodEnd = dates[dates.length - 1];
  if (!periodStart || !periodEnd) {
    throw new Error("A batch needs a statement row");
  }
  if (input.newFile) {
    if (!input.bytes) {
      throw new Error("A new document needs file bytes");
    }
    writeNewFile(input.dataDir, input.document.hash, input.bytes);
  }
  const batchId = crypto.randomUUID();
  let saved: ImportBatch | undefined;
  try {
  write(db, { source: input.source, at: input.at }, (tx) => {
    if (input.newFile) {
      tx.insert(documents).values(input.document).run();
      tx.audit({
        entity: "documents",
        entityId: input.document.id,
        action: "create",
        before: null,
        after: {
          filename: input.document.filename,
          hash: input.document.hash,
          mimeType: input.document.mimeType,
          storagePath: input.document.storagePath,
          uploadedAt: input.document.uploadedAt,
          deletedAt: null,
        },
      });
    } else if (input.restoreDocument) {
      const current = tx.select().from(documents).where(eq(documents.id, input.document.id)).get();
      if (!current) {
        throw new Error("Document is missing");
      }
      tx.update(documents).set({ deletedAt: null }).where(eq(documents.id, current.id)).run();
      tx.audit({
        entity: "documents",
        entityId: current.id,
        action: "restore",
        before: { ...current },
        after: { ...current, deletedAt: null },
      });
    }
    tx.insert(importBatches)
      .values({
        id: batchId,
        accountId: input.accountId,
        documentId: input.document.id,
        parser: input.parser,
        periodStart,
        periodEnd,
        closingBalance: input.closingBalance,
        closingDate: input.closingDate,
        unreadableJson: JSON.stringify(input.unreadable),
        createdAt: input.at,
        undoneAt: null,
      })
      .run();
    const created = input.rows.filter((row) => row.outcome === "created");
    const book = loadMatchBook(tx);
    const pending = created.map((row) => ({
      id: `import:${row.rowIndex}`,
      accountId: input.accountId,
      date: row.date,
      amount: row.amount,
      merchantId: null,
    }));
    const recurring = input.asOf ? recurringForRows(tx, pending, input.asOf) : new Map();
    const scores = new Map<number, MatchResult>();
    for (const row of created) {
      const hit = recurring.get(`import:${row.rowIndex}`) ?? null;
      scores.set(row.rowIndex, scorePayee(book, { payee: normalizePayee(row.payeeRaw), amount: row.amount, recurring: hit }));
    }
    const createdIds: string[] = [];
    for (const row of input.rows) {
      if (row.outcome === "created") {
        const hit = recurring.get(`import:${row.rowIndex}`);
        const newId = insertCreated(tx, batchId, input.accountId, row, scores.get(row.rowIndex) ?? scorePayee(book, { payee: normalizePayee(row.payeeRaw), amount: row.amount, recurring: null }), hit?.dueDate ?? null);
        createdIds.push(newId);
      } else if (row.outcome === "matched") {
        insertMatched(tx, batchId, input.accountId, row);
      } else {
        insertPlain(tx, batchId, input.accountId, row);
      }
    }
    for (const newId of createdIds) {
      linkRefundIfSure(tx, newId);
    }
    saveFormat(tx, input.accountId, input.presetId, input.columnMap);
    const batch = tx.select().from(importBatches).where(eq(importBatches.id, batchId)).get();
    if (!batch) {
      throw new Error("Import batch is missing");
    }
    const presented = presentBatch(tx, batch);
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
  } catch (error) {
    if (input.newFile) {
      unlinkSync(join(input.dataDir, "uploads", input.document.hash));
    }
    throw error;
  }
  if (!saved) {
    throw new Error("Import did not return a batch");
  }
  return saved;
}
