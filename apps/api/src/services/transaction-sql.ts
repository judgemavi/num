import { transactionLines, transactions } from "@num/db";
import { and, count, eq, exists, isNotNull, isNull, ne, notExists, or, sql, type SQL } from "drizzle-orm";
import { alias, QueryBuilder, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

/**
 * Subqueries on the rows of one transaction. Give the id column of the outer table (or of its alias).
 * Each condition is a nested expression (`eq`, `and`): Drizzle keeps the table name of a column only there.
 */
const query = new QueryBuilder();

type Outer = AnySQLiteColumn | SQL;

/**
 * A number that is part of the query text. SQLite plans `mirror = 0` and `mirror = ?` in different ways:
 * it treats a comparison with a parameter as more selective. Use a literal for a fixed 0, 1 or small count.
 */
export function literal(value: number) {
  return sql.raw(String(value));
}

/** The lines with no category and no transfer. This is the Needs review rule. */
function openLines(transactionId: Outer) {
  return query
    .select({ found: sql`1` })
    .from(transactionLines)
    .where(
      and(
        eq(transactionLines.transactionId, transactionId),
        isNull(transactionLines.categoryId),
        isNull(transactionLines.transferAccountId),
      ),
    );
}

export function hasOpenLine(transactionId: Outer) {
  return exists(openLines(transactionId));
}

export function hasNoOpenLine(transactionId: Outer) {
  return notExists(openLines(transactionId));
}

/** A line that is a transfer. Give an account to find a transfer to that account. */
export function hasTransferLine(transactionId: Outer, toAccountId?: string) {
  return exists(
    query
      .select({ found: sql`1` })
      .from(transactionLines)
      .where(
        and(
          eq(transactionLines.transactionId, transactionId),
          toAccountId ? eq(transactionLines.transferAccountId, toAccountId) : isNotNull(transactionLines.transferAccountId),
        ),
      ),
  );
}

const otherLine = alias(transactionLines, "other_line");

/** In a join of `transactions` and `transaction_lines`: the line is the only line of its transaction. */
export const isOnlyLine = notExists(
  query
    .select({ found: sql`1` })
    .from(otherLine)
    .where(and(eq(otherLine.transactionId, transactions.id), ne(otherLine.id, transactionLines.id))),
);

export function lineCount(transactionId: Outer) {
  return sql<number>`${query.select({ total: count() }).from(transactionLines).where(eq(transactionLines.transactionId, transactionId))}`;
}

/** The category of the line of a transaction that has one line. */
export function lineCategory(transactionId: Outer) {
  return sql<string | null>`${query
    .select({ categoryId: transactionLines.categoryId })
    .from(transactionLines)
    .where(eq(transactionLines.transactionId, transactionId))}`;
}

const refunds = alias(transactions, "refunds");

/** The sum of the refunds that point to a purchase. Null when there is none. */
export function refundedSum(purchaseId: Outer) {
  return sql<number | null>`${query
    .select({ total: sql`sum(${refunds.amount})` })
    .from(refunds)
    .where(eq(refunds.refundOfId, purchaseId))}`;
}

/** True when the row came from a statement file. */
export const isImported = sql<boolean>`${or(eq(transactions.source, "import"), isNotNull(transactions.importRowId))}`.mapWith(Boolean);
