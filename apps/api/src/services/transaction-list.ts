import { usesValuation } from "@num/shared";
import { accounts, categories, lineTags, merchants, transactionLines, transactions } from "@num/db";
import type {
  TransactionFilter,
  TransactionListItem,
  TransactionListQuery,
  TransactionReview,
  TransactionReviewListQuery,
} from "@num/shared";
import { and, asc, count, desc, eq, exists, gte, inArray, isNotNull, isNull, lte, notExists, or, sql, type SQL } from "drizzle-orm";
import { alias, QueryBuilder, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { Db } from "../db";
import { linesForIds } from "./transaction-list-lines";
import { listNeedsReview, reviewCounts, type NeedsReviewHit } from "./needs-review";
import { hasOpenLine, refundedSum } from "./transaction-sql";

const sortColumns = {
  date: transactions.date,
  amount: transactions.amount,
  payeeRaw: transactions.payeeRaw,
};

const subquery = new QueryBuilder();
const purchase = alias(transactions, "purchase");
const onMerchant = eq(merchants.id, transactions.merchantId);

/** One field of the purchase that a refund points to. */
function purchaseField<T extends AnySQLiteColumn>(field: T) {
  return sql<T["_"]["data"] | null>`${subquery.select({ field }).from(purchase).where(eq(purchase.id, transactions.refundOfId))}`;
}

const listColumns = {
  id: transactions.id,
  accountId: transactions.accountId,
  accountName: accounts.name,
  accountKind: accounts.kind,
  date: transactions.date,
  amount: transactions.amount,
  payeeRaw: transactions.payeeRaw,
  merchantId: transactions.merchantId,
  merchantName: merchants.name,
  status: transactions.status,
  accountOpening: accounts.openingBalance,
  autoReason: transactions.autoReason,
  autoConfidence: transactions.autoConfidence,
  refundOfKey: purchaseField(purchase.id),
  refundOfDate: purchaseField(purchase.date),
  refundOfAmount: purchaseField(purchase.amount),
  refundedAmount: refundedSum(transactions.id),
};

function selectRows(db: Db) {
  return db
    .select(listColumns)
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(merchants, onMerchant);
}

type ListRow = ReturnType<ReturnType<typeof selectRows>["all"]>[number];

function order(query: Pick<TransactionListQuery, "automatic" | "sort" | "dir">) {
  if (query.automatic && query.sort === undefined) {
    return [asc(transactions.autoConfidence), asc(transactions.id)];
  }
  const direction = (query.dir ?? (query.sort === undefined ? "desc" : "asc")) === "desc" ? desc : asc;
  return [direction(sortColumns[query.sort ?? "date"]), direction(transactions.id)];
}

/**
 * A line of the transaction that has a category. Give the condition on the category, and one on the line if necessary.
 * The categories are a list that SQLite makes one time. A join reads the category of each line.
 */
function categoryLine(category: SQL, line?: SQL) {
  const matching = subquery.select({ id: categories.id }).from(categories).where(category);
  return exists(
    subquery
      .select({ found: sql`1` })
      .from(transactionLines)
      .where(and(eq(transactionLines.transactionId, transactions.id), inArray(transactionLines.categoryId, matching), line)),
  );
}

/**
 * The transactions that have a line in the category, or a line with the tag.
 * These subqueries do not refer to the outer row, and SQLite reads the index of the category or of the tag one time.
 * In a correlated EXISTS, SQLite reads that index one time for each transaction.
 */
const lineOwner = { id: transactionLines.transactionId };

function inCategory(categoryId: string) {
  return inArray(transactions.id, subquery.select(lineOwner).from(transactionLines).where(eq(transactionLines.categoryId, categoryId)));
}

function hasTag(tagId: string) {
  return inArray(
    transactions.id,
    subquery
      .select(lineOwner)
      .from(transactionLines)
      .innerJoin(lineTags, eq(lineTags.lineId, transactionLines.id))
      .where(eq(lineTags.tagId, tagId)),
  );
}

function contains(text: SQL, needle: string) {
  return sql`instr(lower(${text}), lower(${needle})) > 0`;
}

function filters(query: TransactionFilter) {
  const parts: (SQL | undefined)[] = [];
  if (query.accountId) {
    parts.push(eq(transactions.accountId, query.accountId));
  }
  if (query.merchantId === "none") {
    parts.push(isNull(transactions.merchantId));
  } else if (query.merchantId) {
    parts.push(eq(transactions.merchantId, query.merchantId));
  }
  if (query.groupId === "none") {
    parts.push(categoryLine(isNull(categories.groupId)));
  } else if (query.groupId) {
    parts.push(categoryLine(eq(categories.groupId, query.groupId)));
  }
  if (query.from) {
    parts.push(gte(transactions.date, query.from));
  }
  if (query.to) {
    parts.push(lte(transactions.date, query.to));
  }
  if (query.categoryId) {
    parts.push(inCategory(query.categoryId));
  }
  if (query.tagId === "none") {
    parts.push(
      categoryLine(
        eq(categories.kind, "expense"),
        notExists(subquery.select({ found: sql`1` }).from(lineTags).where(eq(lineTags.lineId, transactionLines.id))),
      ),
    );
  } else if (query.tagId) {
    parts.push(hasTag(query.tagId));
  }
  if (query.uncategorized) {
    parts.push(hasOpenLine(transactions.id));
  }
  if (query.automatic) {
    parts.push(isNotNull(transactions.autoReason));
  }
  if (query.q) {
    parts.push(
      or(
        contains(sql`${transactions.payeeRaw}`, query.q),
        contains(sql`ifnull(${merchants.name}, '')`, query.q),
      ),
    );
  }
  return and(...parts);
}

function toItem(
  row: ListRow,
  lines: TransactionListItem["lines"],
  review: TransactionReview | null,
  runningBalance: number | null,
): TransactionListItem {
  const { accountOpening, refundOfKey, refundOfDate, refundOfAmount, refundedAmount, ...head } = row;
  return {
    ...head,
    runningBalance,
    refundOf:
      refundOfKey === null || refundOfDate === null || refundOfAmount === null
        ? null
        : { id: refundOfKey, date: refundOfDate, amount: refundOfAmount },
    refundedAmount,
    lines,
    review,
  };
}

function usesTransactionBalance(db: Db, accountId: string) {
  const row = db.select({ kind: accounts.kind }).from(accounts).where(eq(accounts.id, accountId)).get();
  return row !== undefined && !usesValuation(row.kind);
}

/** The balance of the account after each row: the opening balance and all the rows up to it. One window query. */
function runningBalances(db: Db, accountId: string, rows: readonly ListRow[]) {
  const balances = new Map<string, number>();
  if (rows.length === 0) {
    return balances;
  }
  const running = db
    .select({
      id: transactions.id,
      spent: sql<number>`sum(${transactions.amount}) over (order by ${transactions.date} asc, ${transactions.id} asc)`.as("spent"),
    })
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .as("running");
  const spentById = new Map(
    db
      .select({ id: running.id, spent: running.spent })
      .from(running)
      .where(inArray(running.id, rows.map((row) => row.id)))
      .all()
      .map((row) => [row.id, row.spent]),
  );
  for (const row of rows) {
    const spent = spentById.get(row.id);
    if (spent === undefined) {
      throw new Error("Running balance is missing");
    }
    const balance = row.accountOpening + spent;
    if (!Number.isSafeInteger(balance)) {
      throw new Error("Sum is not an integer");
    }
    balances.set(row.id, balance);
  }
  return balances;
}

/** The rows whose id is in the list. One parameter: a JSON array that SQLite reads with `json_each`. */
function idIn(ids: readonly string[]) {
  return inArray(transactions.id, sql`(select value from json_each(${JSON.stringify(ids)}))`);
}

/** Needs review rows that also match the other filters. Bulk approval and the review list use the same set. */
export function filteredReviewHits(db: Db, filter: TransactionFilter, asOf: string): NeedsReviewHit[] {
  const hits = listNeedsReview(db, asOf);
  const where = filters(filter);
  if (where === undefined || hits.length === 0) {
    return hits;
  }
  const ids = db.select({ id: transactions.id }).from(transactions).$dynamic();
  const matching = new Set(
    (filter.q ? ids.leftJoin(merchants, onMerchant) : ids)
      .where(and(idIn(hits.map((hit) => hit.id)), where))
      .all()
      .map((row) => row.id),
  );
  return hits.filter((hit) => matching.has(hit.id));
}

/** One page of rows for the condition, in the sort order, with the running balance of one account. */
function readPage(
  db: Db,
  query: TransactionListQuery | TransactionReviewListQuery,
  where: SQL | undefined,
  sortOrder: SQL[],
  review: (ids: string[]) => Map<string, TransactionReview>,
) {
  const counted = db.select({ total: count() }).from(transactions).$dynamic();
  const total = (query.q ? counted.leftJoin(merchants, onMerchant) : counted).where(where).get()?.total ?? 0;
  const rows = selectRows(db)
    .where(where)
    .orderBy(...sortOrder)
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)
    .all();
  const ids = rows.map((row) => row.id);
  const balances =
    query.accountId && usesTransactionBalance(db, query.accountId) ? runningBalances(db, query.accountId, rows) : null;
  const lines = linesForIds(db, ids);
  const reviews = review(ids);
  return {
    items: rows.map((row) => toItem(row, lines.get(row.id) ?? [], reviews.get(row.id) ?? null, balances?.get(row.id) ?? null)),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

function reviewMap(hits: readonly NeedsReviewHit[]) {
  return new Map(hits.map((hit) => [hit.id, hit.review]));
}

/** A page of transactions. With `asOf`, each row that needs review has its review: only the rows of the page get a score. */
export function listTransactions(db: Db, query: TransactionListQuery & { asOf?: string }) {
  const { asOf } = query;
  return readPage(db, query, filters(query), order(query), (ids) =>
    asOf && ids.length > 0 ? reviewMap(listNeedsReview(db, asOf, { only: ids })) : new Map(),
  );
}

/** The levels from low to high confidence. A question has no level. */
const levelRanks = { none: 0, question: 1, maybe: 2, likely: 3, sure: 4 };

/** The score of a row in its level: the score of the automatic label or of the suggestion. Scores are 0 to 1000. */
function confidenceRank({ review, autoConfidence }: NeedsReviewHit) {
  if (review.question !== "categorize") {
    return levelRanks.question * 1001;
  }
  const score = review.level === "sure" ? (autoConfidence ?? 0) : review.level === "none" ? 0 : (review.suggestion?.confidence ?? 0);
  return levelRanks[review.level] * 1001 + score;
}

/**
 * The confidence order of the review rows: the level first, then the score. Equal rows are newest first.
 * One parameter: a JSON object of the rank of each id that SQLite reads with `json_each`.
 */
function confidenceOrder(hits: readonly NeedsReviewHit[], dir: TransactionReviewListQuery["dir"]) {
  const ranks = JSON.stringify(Object.fromEntries(hits.map((hit) => [hit.id, confidenceRank(hit)])));
  const rank = sql`(select value from json_each(${ranks}) where key = ${transactions.id})`;
  return [(dir === "desc" ? desc : asc)(rank), desc(transactions.date), desc(transactions.id)];
}

/**
 * A page of the transactions that need review. The same filters and pages as the list.
 * The list also sorts by confidence. With no sort, the order is confidence, high to low.
 */
export function listReviewTransactions(db: Db, query: TransactionReviewListQuery & { asOf: string }) {
  const hits = filteredReviewHits(db, query, query.asOf);
  const reviews = reviewMap(hits);
  const where = hits.length === 0 ? sql`0` : idIn(hits.map((hit) => hit.id));
  const sortOrder =
    query.sort === undefined
      ? confidenceOrder(hits, query.dir ?? "desc")
      : query.sort === "confidence"
        ? confidenceOrder(hits, query.dir)
        : order({ ...query, sort: query.sort });
  return { ...readPage(db, query, where, sortOrder, () => reviews), reviewCounts: reviewCounts(hits) };
}

/** The review of one transaction: the question and the proposed answer that the editor shows. */
export function transactionReview(db: Db, id: string, asOf: string) {
  return { review: listNeedsReview(db, asOf, { only: [id] })[0]?.review ?? null };
}
