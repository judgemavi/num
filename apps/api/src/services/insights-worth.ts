import { accounts, mortgageTerms, transactions, valuations } from "@num/db";
import {
  accountClass,
  accountKinds,
  compounding,
  mortgageBalanceAsOf,
  paymentFrequencies,
  type AccountKind,
  type MortgageTerms,
  type MortgageValuation,
} from "@num/shared";
import { isNull } from "drizzle-orm";
import type { Db } from "../db";
import type { MonthPoint } from "./insights-spend";

type AccountRow = {
  id: string;
  kind: AccountKind;
  openingDate: string;
  openingBalance: number;
};

type Txn = {
  date: string;
  amount: number;
};

function asKind(value: string): AccountKind {
  if (!(accountKinds as readonly string[]).includes(value)) {
    throw new Error("Unknown account kind");
  }
  return value as AccountKind;
}

function asTerms(row: typeof mortgageTerms.$inferSelect): MortgageTerms {
  if (!(compounding as readonly string[]).includes(row.compounding)) {
    throw new Error("Unknown compounding");
  }
  if (!(paymentFrequencies as readonly string[]).includes(row.paymentFrequency)) {
    throw new Error("Unknown payment frequency");
  }
  return {
    accountId: row.accountId,
    principal: row.principal,
    principalAsOf: row.principalAsOf,
    rateMilliPct: row.rateMilliPct,
    compounding: row.compounding as MortgageTerms["compounding"],
    paymentAmount: row.paymentAmount,
    paymentFrequency: row.paymentFrequency as MortgageTerms["paymentFrequency"],
    firstPaymentDate: row.firstPaymentDate,
    termEnd: row.termEnd,
    amortizationMonthsRemaining: row.amortizationMonthsRemaining,
    paymentAccountId: row.paymentAccountId,
    interestCategoryId: row.interestCategoryId,
    propertyAccountId: row.propertyAccountId,
  };
}

function sumBetween(rows: readonly Txn[], after: string | null, through: string, openingDate: string): number {
  let total = 0;
  for (const row of rows) {
    if (row.date < openingDate || row.date > through) {
      continue;
    }
    if (after !== null && row.date <= after) {
      continue;
    }
    total += row.amount;
  }
  return total;
}

function latestMark(marks: readonly MortgageValuation[], through: string, openingDate: string): MortgageValuation | null {
  let latest: MortgageValuation | null = null;
  for (const mark of marks) {
    if (mark.date < openingDate || mark.date > through) {
      continue;
    }
    if (!latest || mark.date > latest.date) {
      latest = mark;
    }
  }
  return latest;
}

function assetBalance(account: AccountRow, txns: readonly Txn[], marks: readonly MortgageValuation[], through: string): number {
  if (through < account.openingDate) {
    return 0;
  }
  if (account.kind === "investment" || account.kind === "property") {
    const mark = latestMark(marks, through, account.openingDate);
    if (mark) {
      return mark.balance + sumBetween(txns, mark.date, through, account.openingDate);
    }
  }
  return account.openingBalance + sumBetween(txns, null, through, account.openingDate);
}

function mortgageOwed(terms: MortgageTerms, marks: readonly MortgageValuation[], through: string, openingDate: string): number {
  if (through < openingDate || through < terms.principalAsOf) {
    return 0;
  }
  return mortgageBalanceAsOf(terms, [...marks], through);
}

export function netWorthSeries(
  db: Db,
  points: readonly MonthPoint[],
): { month: string; date: string; assets: number; liabilities: number; net: number }[] {
  const accountRows = db
    .select()
    .from(accounts)
    .all()
    .map((row) => ({
      id: row.id,
      kind: asKind(row.kind),
      openingDate: row.openingDate,
      openingBalance: row.openingBalance,
    }));
  const txByAccount = new Map<string, Txn[]>();
  for (const row of db
    .select({ accountId: transactions.accountId, date: transactions.date, amount: transactions.amount })
    .from(transactions)
    .where(isNull(transactions.deletedAt))
    .all()) {
    const list = txByAccount.get(row.accountId) ?? [];
    list.push({ date: row.date, amount: row.amount });
    txByAccount.set(row.accountId, list);
  }
  const marksByAccount = new Map<string, MortgageValuation[]>();
  for (const row of db
    .select({ accountId: valuations.accountId, date: valuations.date, balance: valuations.balance })
    .from(valuations)
    .where(isNull(valuations.deletedAt))
    .all()) {
    const list = marksByAccount.get(row.accountId) ?? [];
    list.push({ date: row.date, balance: row.balance });
    marksByAccount.set(row.accountId, list);
  }
  const termsByAccount = new Map(db.select().from(mortgageTerms).all().map((row) => [row.accountId, asTerms(row)]));
  return points.map((point) => {
    let assets = 0;
    let liabilities = 0;
    for (const account of accountRows) {
      const txns = txByAccount.get(account.id) ?? [];
      const marks = marksByAccount.get(account.id) ?? [];
      if (account.kind === "mortgage") {
        const terms = termsByAccount.get(account.id);
        if (terms) {
          liabilities += mortgageOwed(terms, marks, point.date, account.openingDate);
          continue;
        }
      }
      const balance = assetBalance(account, txns, marks, point.date);
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
