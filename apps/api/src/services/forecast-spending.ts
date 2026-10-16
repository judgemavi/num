import { accounts, bucketCategories, buckets, categories, occurrenceLinks, transactionLines, transactions } from "@num/db";
import { medianAmount, monthLastDay } from "@num/shared";
import { and, eq, exists, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "../db";

/** Spending caps count when an open on-budget account has used one of the bucket's categories. */
export function spendingCaps(db: Db) {
  const used = db.select({ id: transactionLines.id }).from(transactionLines)
    .innerJoin(transactions, eq(transactions.id, transactionLines.transactionId))
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .innerJoin(bucketCategories, eq(bucketCategories.categoryId, transactionLines.categoryId))
    .where(and(eq(bucketCategories.bucketId, buckets.id), eq(accounts.onBudget, true), isNull(accounts.archivedAt)));
  return db.select({ monthly: buckets.refillTo, bucketId: buckets.id }).from(buckets)
    .where(and(eq(buckets.kind, "spending"), isNull(buckets.archivedAt), isNotNull(buckets.refillTo), exists(used)))
    .all().flatMap((row) => row.monthly ? [{ monthly: row.monthly, bucketId: row.bucketId }] : []);
}

/** Aggregate only the selected months. The median of the individual lines sets the outlier limit before the sums. */
export function unbucketedSpending(db: Db, months: readonly string[], step: number) {
  const first = months[0];
  const last = months.at(-1);
  if (!first || !last) return [];
  const rows = db.all<{ categoryId: string; month: string; amount: number }>(sql`
    WITH ranked AS (
      SELECT ${transactionLines.categoryId} AS categoryId,
        substr(${transactions.date}, 1, 7) AS month, ${transactionLines.amount} AS amount,
        row_number() OVER (PARTITION BY ${transactionLines.categoryId} ORDER BY ${transactionLines.amount}) AS position,
        count(*) OVER (PARTITION BY ${transactionLines.categoryId}) AS size
      FROM ${transactionLines}
      JOIN ${transactions} ON ${transactions.id} = ${transactionLines.transactionId}
      JOIN ${accounts} ON ${accounts.id} = ${transactions.accountId}
      JOIN ${categories} ON ${categories.id} = ${transactionLines.categoryId}
      WHERE ${accounts.onBudget} = 1 AND ${accounts.archivedAt} IS NULL
        AND ${categories.kind} = 'expense' AND ${categories.archivedAt} IS NULL
        AND ${transactions.date} >= ${`${first}-01`} AND ${transactions.date} <= ${monthLastDay(last)}
        AND NOT EXISTS (SELECT 1 FROM ${bucketCategories} WHERE ${bucketCategories.categoryId} = ${transactionLines.categoryId})
        AND NOT EXISTS (SELECT 1 FROM ${occurrenceLinks} WHERE ${occurrenceLinks.transactionId} = ${transactions.id})
    ), medians AS (
      SELECT categoryId,
        CASE WHEN sum(amount) < 0 THEN -((abs(sum(amount)) + count(*) / 2) / count(*))
          ELSE (sum(amount) + count(*) / 2) / count(*) END AS amount
      FROM ranked WHERE position IN ((size + 1) / 2, (size + 2) / 2) GROUP BY categoryId
    )
    SELECT ranked.categoryId, ranked.month, sum(ranked.amount) AS amount
    FROM ranked JOIN medians ON medians.categoryId = ranked.categoryId
    WHERE abs(ranked.amount) <= abs(medians.amount) * 3
    GROUP BY ranked.categoryId, ranked.month
  `);
  const totals = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const category = totals.get(row.categoryId) ?? new Map<string, number>();
    category.set(row.month, row.amount);
    totals.set(row.categoryId, category);
  }
  return [...totals.values()].flatMap((category) => {
    const monthly = -medianAmount(months.map((month) => category.get(month) ?? 0), step);
    return monthly > 0 ? [{ monthly, bucketId: null }] : [];
  });
}
