import { accounts, transactions, valuations } from "@num/db";
import { accountClass } from "@num/shared";
import { asc, sql } from "drizzle-orm";
import type { Db } from "../db";
import { accountBalance } from "./account-rules";

export type MonthPoint = {
  month: string;
  date: string;
};

/** The dates on which the transactions of an account change its total, with the total on and after each date. */
type Totals = { dates: string[]; totals: number[] };

/** The total of the rows dated on or before `date`. The dates are in ascending order. */
function totalThrough(history: Totals | undefined, date: string) {
  if (!history) {
    return 0;
  }
  let low = 0;
  let high = history.dates.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((history.dates[middle] ?? "") <= date) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low === 0 ? 0 : (history.totals[low - 1] ?? 0);
}

/** The running total of the transactions of each account, by date. One query for all accounts and dates. */
function loadTotals(db: Db) {
  const rows = db
    .select({ accountId: transactions.accountId, date: transactions.date, total: sql<number>`sum(${transactions.amount})` })
    .from(transactions)
    .groupBy(transactions.accountId, transactions.date)
    .orderBy(asc(transactions.accountId), asc(transactions.date))
    .all();
  const byAccount = new Map<string, Totals>();
  for (const row of rows) {
    const history = byAccount.get(row.accountId) ?? { dates: [], totals: [] };
    history.dates.push(row.date);
    history.totals.push((history.totals[history.totals.length - 1] ?? 0) + row.total);
    byAccount.set(row.accountId, history);
  }
  return byAccount;
}

export function netWorthSeries(
  db: Db,
  points: readonly MonthPoint[],
): { month: string; date: string; assets: number; liabilities: number; net: number }[] {
  const accountRows = db.select().from(accounts).all();
  const totals = loadTotals(db);
  const valued = db
    .select({ accountId: valuations.accountId, date: valuations.date, balance: valuations.balance })
    .from(valuations)
    .orderBy(asc(valuations.date))
    .all();
  return points.map((point) => {
    let assets = 0;
    let liabilities = 0;
    for (const account of accountRows) {
      const history = totals.get(account.id);
      const transactionTotal = totalThrough(history, point.date);
      const valuation = valued.findLast((row) => row.accountId === account.id && row.date <= point.date);
      const balance = accountBalance({
        kind: account.kind,
        openingBalance: account.openingBalance,
        transactionTotal,
        valuation: valuation
          ? { balance: valuation.balance, transactionsAfter: transactionTotal - totalThrough(history, valuation.date) }
          : null,
      });
      if (accountClass(account.kind) === "liability") {
        if (balance < 0) {
          liabilities += -balance;
        } else {
          assets += balance;
        }
      } else {
        assets += balance;
      }
    }
    return { month: point.month, date: point.date, assets, liabilities, net: assets - liabilities };
  });
}
