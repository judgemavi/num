import { transactions, valuations } from "@num/db";
import type { AccountKind } from "@num/shared";
import { and, eq, gt, lte, sql } from "drizzle-orm";
import type { Db } from "../db";
import { whole } from "../whole";
import { accountBalance } from "./account-rules";
import type { WriteTx } from "./write";

type Reader = Db | WriteTx;

function readSum(row: { total: unknown } | undefined): number {
  if (!row) {
    return 0;
  }
  return whole(row.total);
}

function sumBetween(db: Reader, accountId: string, after: string | null, through: string): number {
  const filters = [eq(transactions.accountId, accountId), lte(transactions.date, through)];
  if (after !== null) {
    filters.push(gt(transactions.date, after));
  }
  const row = db
    .select({
      total: sql<unknown>`coalesce(sum(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(and(...filters))
    .get();
  return readSum(row);
}

function valuationOn(db: Reader, accountId: string, date: string): { date: string; balance: number } | null {
  const rows = db
    .select({
      date: valuations.date,
      balance: valuations.balance,
    })
    .from(valuations)
    .where(and(eq(valuations.accountId, accountId), lte(valuations.date, date)))
    .all();
  let latest: { date: string; balance: number } | null = null;
  for (const row of rows) {
    if (!latest || row.date > latest.date) {
      latest = row;
    }
  }
  return latest;
}

export function calculatedBalance(
  db: Reader,
  account: { id: string; kind: AccountKind; openingBalance: number },
  date: string,
): number {
  const valuation =
    account.kind === "investment" || account.kind === "property" ? valuationOn(db, account.id, date) : null;
  if (valuation) {
    return accountBalance({
      kind: account.kind,
      openingBalance: account.openingBalance,
      transactionTotal: 0,
      valuation: {
        balance: valuation.balance,
        transactionsAfter: sumBetween(db, account.id, valuation.date, date),
      },
    });
  }
  return accountBalance({
    kind: account.kind,
    openingBalance: account.openingBalance,
    transactionTotal: sumBetween(db, account.id, null, date),
    valuation: null,
  });
}
