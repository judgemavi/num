import { accounts, documents, importBatches, importRows, inboxDecisions, transactions } from "@num/db";
import {
  importBatchStatus,
  type ImportDetail,
  type ImportDetailRow,
  type ImportViewItem,
  type ImportViewQuery,
} from "@num/shared";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { readUnreadable } from "./import-read";

type OutcomeCounts = {
  created: number;
  matched: number;
  duplicate: number;
  needsReview: number;
};

type EarlierCandidate = {
  id: string;
  batchId: string;
  identity: string;
  rowIndex: number;
  createdAt: string;
  active: boolean;
};

function emptyCounts(): OutcomeCounts {
  return { created: 0, matched: 0, duplicate: 0, needsReview: 0 };
}

function addOutcome(counts: OutcomeCounts, outcome: string) {
  if (outcome === "created") {
    counts.created += 1;
  } else if (outcome === "matched") {
    counts.matched += 1;
  } else if (outcome === "duplicate") {
    counts.duplicate += 1;
  } else if (outcome === "needs_review") {
    counts.needsReview += 1;
  }
}

function newestFirst(query: ImportViewQuery): boolean {
  if (query.sort === undefined && query.dir === undefined) {
    return true;
  }
  return query.dir === "desc";
}

function compareItems(left: ImportViewItem, right: ImportViewItem, newest: boolean): number {
  if (left.createdAt !== right.createdAt) {
    const order = left.createdAt < right.createdAt ? -1 : 1;
    return newest ? -order : order;
  }
  const idOrder = left.id < right.id ? -1 : 1;
  return newest ? -idOrder : idOrder;
}

function withinDates(createdAt: string, query: ImportViewQuery): boolean {
  const date = createdAt.slice(0, 10);
  if (query.from && date < query.from) {
    return false;
  }
  if (query.to && date > query.to) {
    return false;
  }
  return true;
}

function loadItems(db: Db): ImportViewItem[] {
  const decided = new Set(db.select({ itemKey: inboxDecisions.itemKey }).from(inboxDecisions).all().map((row) => row.itemKey));
  const batches = db
    .select({
      id: importBatches.id,
      accountId: importBatches.accountId,
      accountName: accounts.name,
      documentId: importBatches.documentId,
      filename: documents.filename,
      periodStart: importBatches.periodStart,
      periodEnd: importBatches.periodEnd,
      createdAt: importBatches.createdAt,
      undoneAt: importBatches.undoneAt,
      unreadableJson: importBatches.unreadableJson,
    })
    .from(importBatches)
    .innerJoin(accounts, eq(accounts.id, importBatches.accountId))
    .leftJoin(documents, eq(documents.id, importBatches.documentId))
    .all();
  const outcomes = db.select({ batchId: importRows.batchId, outcome: importRows.outcome }).from(importRows).all();
  const byBatch = new Map<string, OutcomeCounts>();
  for (const row of outcomes) {
    const counts = byBatch.get(row.batchId) ?? emptyCounts();
    addOutcome(counts, row.outcome);
    byBatch.set(row.batchId, counts);
  }

  return batches.map((batch) => {
    const counts = byBatch.get(batch.id) ?? emptyCounts();
    const unreadable = readUnreadable(batch.unreadableJson);
    return {
      id: batch.id,
      accountId: batch.accountId,
      accountName: batch.accountName,
      documentId: batch.documentId,
      filename: batch.filename ?? null,
      periodStart: batch.periodStart,
      periodEnd: batch.periodEnd,
      createdAt: batch.createdAt,
      status: importBatchStatus({
        undoneAt: batch.undoneAt,
        needsReview: counts.needsReview,
        batchId: batch.id,
        unreadableLines: unreadable.map((row) => row.line),
        decidedKeys: decided,
      }),
      counts: { ...counts, unreadable: unreadable.length },
    };
  });
}

export function listImportView(db: Db, query: ImportViewQuery) {
  const items = loadItems(db)
    .filter((item) => (query.accountId ? item.accountId === query.accountId : true))
    .filter((item) => withinDates(item.createdAt, query))
    .filter((item) => (query.status ? item.status === query.status : true))
    .sort((left, right) => compareItems(left, right, newestFirst(query)));
  const offset = (query.page - 1) * query.pageSize;
  return {
    items: items.slice(offset, offset + query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    total: items.length,
  };
}

function isEarlier(candidate: EarlierCandidate, createdAt: string, rowIndex: number, rowId: string): boolean {
  if (candidate.createdAt !== createdAt) {
    return candidate.createdAt < createdAt;
  }
  if (candidate.rowIndex !== rowIndex) {
    return candidate.rowIndex < rowIndex;
  }
  return candidate.id < rowId;
}

function pickEarlier(candidates: EarlierCandidate[], createdAt: string, rowIndex: number, rowId: string): EarlierCandidate | null {
  const earlier = candidates.filter((candidate) => isEarlier(candidate, createdAt, rowIndex, rowId));
  const active = earlier.find((candidate) => candidate.active);
  if (active) {
    return active;
  }
  return earlier.sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1))[0] ?? null;
}

export function getImportDetail(db: Db, id: string): ImportDetail {
  const item = loadItems(db).find((batch) => batch.id === id);
  if (!item) {
    throw new ServiceError("import_not_found", 404);
  }
  const batch = db.select().from(importBatches).where(eq(importBatches.id, id)).get();
  if (!batch) {
    throw new ServiceError("import_not_found", 404);
  }
  const rows = db.select().from(importRows).where(eq(importRows.batchId, id)).all();
  rows.sort((left, right) => left.rowIndex - right.rowIndex);
  const transactionIds = rows.flatMap((row) => (row.transactionId ? [row.transactionId] : []));
  const liveTransactions = new Set(
    transactionIds.length === 0
      ? []
      : db
          .select({ id: transactions.id })
          .from(transactions)
          .where(and(inArray(transactions.id, transactionIds)))
          .all()
          .map((row) => row.id),
  );
  const identities = [...new Set(rows.filter((row) => row.outcome === "duplicate").map((row) => row.identity))];
  const candidates =
    identities.length === 0
      ? []
      : db
          .select({
            id: importRows.id,
            batchId: importRows.batchId,
            identity: importRows.identity,
            rowIndex: importRows.rowIndex,
            createdAt: importBatches.createdAt,
            active: importRows.active,
          })
          .from(importRows)
          .innerJoin(importBatches, eq(importBatches.id, importRows.batchId))
          .where(
            and(
              eq(importRows.accountId, batch.accountId),
              inArray(importRows.identity, identities),
              ne(importRows.outcome, "duplicate"),
            ),
          )
          .all();

  const detailRows: ImportDetailRow[] = rows.map((row) => {
    const earlier =
      row.outcome === "duplicate"
        ? pickEarlier(
            candidates.filter((candidate) => candidate.identity === row.identity),
            batch.createdAt,
            row.rowIndex,
            row.id,
          )
        : null;
    return {
      id: row.id,
      rowIndex: row.rowIndex,
      date: row.date,
      amount: row.amount,
      payeeRaw: row.payeeRaw,
      outcome: row.outcome as ImportDetailRow["outcome"],
      transactionId: row.transactionId && liveTransactions.has(row.transactionId) ? row.transactionId : null,
      duplicateBatchId: earlier?.batchId ?? null,
      duplicateRowId: earlier?.id ?? null,
    };
  });

  const decided = new Set(db.select({ itemKey: inboxDecisions.itemKey }).from(inboxDecisions).all().map((row) => row.itemKey));
  return {
    item,
    rows: detailRows,
    unreadable: readUnreadable(batch.unreadableJson).map((row) => ({
      ...row,
      decision: decided.has(`import_unreadable:${batch.id}:${row.line}`) ? ("not_a_transaction" as const) : null,
    })),
  };
}
