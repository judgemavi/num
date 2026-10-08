import { transactions, valuations } from "@num/db";
import type { AccountKind } from "@num/shared";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "../db";
import { integerSum } from "../integer-sum";
import { accountBalance } from "./account-rules";
import type { WriteTx } from "./write";

type Reader = Db | WriteTx;

function readSum(row: { total: unknown } | undefined): number {
  if (!row) {
    return 0;
  }
  return integerSum(row.total);
}

export function transactionTotals(db: Reader, asOf?: string): Map<string, number> {
  const rows = db
    .select({
      accountId: transactions.accountId,
      total: sql<unknown>`coalesce(sum(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(and(isNull(transactions.deletedAt), asOf ? lte(transactions.date, asOf) : undefined))
    .groupBy(transactions.accountId)
    .all();
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.accountId, integerSum(row.total));
  }
  return totals;
}

function sumAfter(db: Reader, accountId: string, date: string, asOf?: string): number {
  const row = db
    .select({
      total: sql<unknown>`coalesce(sum(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        isNull(transactions.deletedAt),
        gt(transactions.date, date),
        asOf ? lte(transactions.date, asOf) : undefined,
      ),
    )
    .get();
  return readSum(row);
}

export function latestValuations(db: Reader, asOf?: string): Map<string, { date: string; balance: number }> {
  const rows = db
    .select({
      accountId: valuations.accountId,
      date: valuations.date,
      balance: valuations.balance,
    })
    .from(valuations)
    .where(and(isNull(valuations.deletedAt), asOf ? lte(valuations.date, asOf) : undefined))
    .all();
  const latest = new Map<string, { date: string; balance: number }>();
  for (const row of rows) {
    const current = latest.get(row.accountId);
    if (!current || row.date > current.date) {
      latest.set(row.accountId, { date: row.date, balance: row.balance });
    }
  }
  return latest;
}

export function balanceOf(
  db: Reader,
  row: { id: string; kind: AccountKind; openingBalance: number },
  totals?: Map<string, number>,
  latest?: Map<string, { date: string; balance: number }>,
  asOf?: string,
): number {
  const valuation = (latest ?? latestValuations(db, asOf)).get(row.id) ?? null;
  return accountBalance({
    kind: row.kind,
    openingBalance: row.openingBalance,
    transactionTotal: (totals ?? transactionTotals(db, asOf)).get(row.id) ?? 0,
    valuation: valuation
      ? { balance: valuation.balance, transactionsAfter: sumAfter(db, row.id, valuation.date, asOf) }
      : null,
  });
}
