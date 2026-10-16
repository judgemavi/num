import { accounts, documents, importBatches, importRows, inboxDecisions, transactions } from "@num/db";
import {
  addDays,
  matchDateWindowDays,
  type ImportDetail,
  type ImportDetailRow,
  type ImportViewItem,
  type ImportViewQuery,
  type ImportViewStatus,
} from "@num/shared";
import { and, asc, count, desc, eq, gte, isNull, lte, ne, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { idIn, pagedOf, totalOf, windowOf } from "./list-sql";

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

function addOutcome(counts: OutcomeCounts, outcome: string, total: number) {
  if (outcome === "created") {
    counts.created += total;
  } else if (outcome === "matched") {
    counts.matched += total;
  } else if (outcome === "duplicate") {
    counts.duplicate += total;
  } else if (outcome === "needs_review") {
    counts.needsReview += total;
  }
}

function newestFirst(query: ImportViewQuery) {
  if (query.sort === undefined && query.dir === undefined) {
    return true;
  }
  return query.dir === "desc";
}

/**
 * The status of a batch: undone; needs you when a row needs review or an unreadable line has no decision; else imported.
 * The status is a SQL value, thus the list filters, sorts and pages in SQL.
 */
const statusSql = sql<ImportViewStatus>`case
  when ${importBatches.undoneAt} is not null then 'undone'
  when exists (select 1 from ${importRows} where ${importRows.batchId} = ${importBatches.id} and ${importRows.outcome} = 'needs_review')
    or exists (
      select 1 from json_each(${importBatches.unreadableJson}) as line
      where not exists (
        select 1 from ${inboxDecisions}
        where ${inboxDecisions.itemKey} = 'import_unreadable:' || ${importBatches.id} || ':' || json_extract(line.value, '$.line')
      )
    )
  then 'needs_you'
  else 'imported'
end`;

function outcomeCounts(db: Db, batchIds: string[]) {
  const outcomes = db
    .select({ batchId: importRows.batchId, outcome: importRows.outcome, total: count() })
    .from(importRows)
    .where(idIn(importRows.batchId, batchIds))
    .groupBy(importRows.batchId, importRows.outcome)
    .all();
  const byBatch = new Map<string, OutcomeCounts>();
  for (const row of outcomes) {
    const counts = byBatch.get(row.batchId) ?? emptyCounts();
    addOutcome(counts, row.outcome, row.total);
    byBatch.set(row.batchId, counts);
  }
  return byBatch;
}

/** The batches that match `where`, in order, for one window. The window is the whole list when `window` is absent. */
function loadItems(db: Db, where: SQL | undefined, newest: boolean, window?: { limit: number; offset: number }): ImportViewItem[] {
  const order = newest ? desc : asc;
  const query = db
    .select({
      id: importBatches.id,
      accountId: importBatches.accountId,
      accountName: accounts.name,
      documentId: importBatches.documentId,
      filename: documents.filename,
      documentDeletedAt: documents.deletedAt,
      transactionCount: sql<number>`(
        select count(*) from ${transactions}
        inner join ${importRows} on ${importRows.id} = ${transactions.importRowId}
        where ${importRows.batchId} = ${importBatches.id}
      )`,
      periodStart: importBatches.periodStart,
      periodEnd: importBatches.periodEnd,
      createdAt: importBatches.createdAt,
      status: statusSql,
      unreadableJson: importBatches.unreadableJson,
    })
    .from(importBatches)
    .innerJoin(accounts, eq(accounts.id, importBatches.accountId))
    .leftJoin(documents, eq(documents.id, importBatches.documentId))
    .where(where)
    .orderBy(order(importBatches.createdAt), order(importBatches.id))
    .$dynamic();
  const batches = (window ? query.limit(window.limit).offset(window.offset) : query).all();
  const byBatch = outcomeCounts(
    db,
    batches.map((batch) => batch.id),
  );
  return batches.map(({ unreadableJson, ...batch }) => ({
    ...batch,
    filename: batch.filename ?? null,
    documentDeletedAt: batch.documentDeletedAt ?? null,
    counts: { ...(byBatch.get(batch.id) ?? emptyCounts()), unreadable: unreadableJson.length },
  }));
}

export function listImportView(db: Db, query: ImportViewQuery) {
  const where = and(
    query.accountId ? eq(importBatches.accountId, query.accountId) : undefined,
    query.from ? gte(sql`substr(${importBatches.createdAt}, 1, 10)`, query.from) : undefined,
    query.to ? lte(sql`substr(${importBatches.createdAt}, 1, 10)`, query.to) : undefined,
    query.status ? sql`${statusSql} = ${query.status}` : undefined,
  );
  const items = loadItems(db, where, newestFirst(query), windowOf(query));
  return pagedOf(items, totalOf(db, importBatches, where), query);
}

function isEarlier(candidate: EarlierCandidate, createdAt: string, rowIndex: number, rowId: string) {
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
  const item = loadItems(db, eq(importBatches.id, id), true)[0];
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
          .where(idIn(transactions.id, transactionIds))
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
              idIn(importRows.identity, identities),
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
      outcome: row.outcome,
      transactionId: row.transactionId && liveTransactions.has(row.transactionId) ? row.transactionId : null,
      duplicateBatchId: earlier?.batchId ?? null,
      duplicateRowId: earlier?.id ?? null,
      matches: [],
    };
  });
  const reviewRows = rows.filter((row) => row.outcome === "needs_review");
  if (reviewRows.length > 0) {
    let minDate = reviewRows[0]?.date ?? "";
    let maxDate = minDate;
    for (const row of reviewRows) {
      if (row.date < minDate) {
        minDate = row.date;
      }
      if (row.date > maxDate) {
        maxDate = row.date;
      }
    }
    const pool = db
      .select({
        id: transactions.id,
        date: transactions.date,
        amount: transactions.amount,
        payeeRaw: transactions.payeeRaw,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, batch.accountId),
          isNull(transactions.importRowId),
          gte(transactions.date, addDays(minDate, -matchDateWindowDays)),
          lte(transactions.date, addDays(maxDate, matchDateWindowDays)),
        ),
      )
      .all();
    for (const detail of detailRows) {
      if (detail.outcome !== "needs_review") {
        continue;
      }
      const start = addDays(detail.date, -matchDateWindowDays);
      const end = addDays(detail.date, matchDateWindowDays);
      detail.matches = pool
        .filter((item) => item.amount === detail.amount && item.date >= start && item.date <= end)
        .sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : left.id < right.id ? -1 : 1));
    }
  }

  const decided = new Set(db.select({ itemKey: inboxDecisions.itemKey }).from(inboxDecisions).all().map((row) => row.itemKey));
  return {
    item,
    rows: detailRows,
    unreadable: batch.unreadableJson.map((row) => ({
      ...row,
      decision: decided.has(`import_unreadable:${batch.id}:${row.line}`) ? ("not_a_transaction" as const) : null,
    })),
  };
}
