import { transactions, valuations } from "@num/db";
import type { AccountKind } from "@num/shared";
import { and, eq, gt, inArray, lte, or, sql } from "drizzle-orm";
import { accountBalance } from "./account-rules";
import type { Reader } from "./write";

type BalanceRow = { id: string; kind: AccountKind; openingBalance: number };

const amountSum = sql<number>`coalesce(sum(${transactions.amount}), 0)`;

function transactionTotals(db: Reader, ids: string[], asOf?: string) {
  const rows = db
    .select({ accountId: transactions.accountId, total: amountSum })
    .from(transactions)
    .where(and(inArray(transactions.accountId, ids), asOf ? lte(transactions.date, asOf) : undefined))
    .groupBy(transactions.accountId)
    .all();
  return new Map(rows.map((row) => [row.accountId, row.total]));
}

function latestValuations(db: Reader, ids: string[], asOf?: string) {
  const rows = db
    .select({
      accountId: valuations.accountId,
      date: valuations.date,
      balance: valuations.balance,
    })
    .from(valuations)
    .where(and(inArray(valuations.accountId, ids), asOf ? lte(valuations.date, asOf) : undefined))
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

/** The sum of the transactions after the latest valuation of each account that has one. One query. */
function totalsAfterValuation(db: Reader, latest: ReadonlyMap<string, { date: string }>, asOf?: string) {
  if (latest.size === 0) {
    return new Map<string, number>();
  }
  const rows = db
    .select({ accountId: transactions.accountId, total: amountSum })
    .from(transactions)
    .where(
      and(
        or(...[...latest].map(([id, valuation]) => and(eq(transactions.accountId, id), gt(transactions.date, valuation.date)))),
        asOf ? lte(transactions.date, asOf) : undefined,
      ),
    )
    .groupBy(transactions.accountId)
    .all();
  return new Map(rows.map((row) => [row.accountId, row.total]));
}

/** Each account with its balance. The number of queries does not depend on the number of accounts. */
export function balancesOf<T extends BalanceRow>(db: Reader, rows: readonly T[], asOf?: string) {
  const ids = rows.map((row) => row.id);
  const totals = transactionTotals(db, ids, asOf);
  const latest = latestValuations(db, ids, asOf);
  const after = totalsAfterValuation(db, latest, asOf);
  return rows.map((account) => {
    const valuation = latest.get(account.id);
    return {
      account,
      balance: accountBalance({
        kind: account.kind,
        openingBalance: account.openingBalance,
        transactionTotal: totals.get(account.id) ?? 0,
        valuation: valuation ? { balance: valuation.balance, transactionsAfter: after.get(account.id) ?? 0 } : null,
      }),
    };
  });
}

export function balanceOf(db: Reader, row: BalanceRow, asOf?: string): number {
  const [found] = balancesOf(db, [row], asOf);
  if (!found) {
    throw new Error("Balance is missing");
  }
  return found.balance;
}
