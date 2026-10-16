import { accounts, mortgageTerms, transactionLines, transactions, valuations } from "@num/db";
import {
  matchMortgageActuals,
  mortgageExtraEffect,
  mortgageLoan,
  mortgageRowsOfYear,
  mortgageSchedule,
  mortgageScheduleYears,
  type MortgageTerms,
  type MortgageValuation,
  type MortgageView,
} from "@num/shared";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import type { Db } from "../db";
import { bookStep } from "./book-step";
import { balanceOf } from "./account-balance";
import { ServiceError } from "../service-error";
import { literal } from "./transaction-sql";
import type { Reader } from "./write";

function requireMortgage(db: Reader, accountId: string) {
  const account = db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) {
    throw new ServiceError("account_not_found", 404);
  }
  if (account.kind !== "mortgage") {
    throw new ServiceError("not_mortgage", 400);
  }
  return account;
}

/** A mortgage with terms always has a stored opening date. */
export function storedOpeningDate(account: { openingDate: string | null }) {
  if (account.openingDate === null) {
    throw new Error("A mortgage with terms has no opening date");
  }
  return account.openingDate;
}

export function activeValuations(db: Reader, accountId: string): MortgageValuation[] {
  return db
    .select({ date: valuations.date, balance: valuations.balance })
    .from(valuations)
    .where(and(eq(valuations.accountId, accountId)))
    .all()
    .sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0));
}

export function getMortgageTerms(db: Db, accountId: string): MortgageTerms {
  requireMortgage(db, accountId);
  const row = db.select().from(mortgageTerms).where(eq(mortgageTerms.accountId, accountId)).get();
  if (!row) {
    throw new ServiceError("mortgage_terms_not_found", 404);
  }
  return row;
}

function actualPayments(db: Db, accountId: string) {
  return db
    .select({ id: transactions.id, date: transactions.date, amount: sql<number>`-${transactions.amount}` })
    .from(transactionLines)
    .innerJoin(transactions, eq(transactionLines.transactionId, transactions.id))
    .where(and(eq(transactionLines.transferAccountId, accountId), eq(transactions.mirror, literal(0)), lt(transactions.amount, literal(0))))
    .groupBy(transactions.id)
    .orderBy(asc(transactions.date), asc(transactions.id))
    .all();
}

/** The schedule of a mortgage with its actual payments. Matching uses the full schedule: a match can cross the end of a year. */
function matchedSchedule(db: Db, accountId: string, asOf: string) {
  const account = requireMortgage(db, accountId);
  const terms = getMortgageTerms(db, accountId);
  const loan = mortgageLoan(terms, { balance: account.openingBalance, date: storedOpeningDate(account) }, bookStep(db));
  const dated = activeValuations(db, accountId);
  const schedule = mortgageSchedule(loan, dated);
  const rows = matchMortgageActuals(schedule.payments, actualPayments(db, accountId), asOf);
  return { account, terms, loan, dated, schedule, rows };
}

export function mortgageAccountView(
  db: Db,
  accountId: string,
  asOf: string,
  options: { extra?: number; lumpSum?: number; lumpDate?: string },
): MortgageView {
  const { account, terms, loan, dated, schedule, rows } = matchedSchedule(db, accountId, asOf);
  const perPayment = options.extra ?? 0;
  const lump = options.lumpSum && options.lumpSum > 0 && options.lumpDate ? { date: options.lumpDate, amount: options.lumpSum } : null;
  const effect = perPayment > 0 || lump ? mortgageExtraEffect(loan, dated, { perPayment, lumpSum: lump }) : null;
  return {
    balance: balanceOf(db, { id: account.id, kind: "mortgage", openingBalance: account.openingBalance }, asOf),
    rateMilliPct: terms.rateMilliPct,
    payoffDate: schedule.payoffDate,
    nonAmortizing: schedule.nonAmortizing,
    termEnd: terms.termEnd,
    paymentAmount: terms.paymentAmount,
    paymentFrequency: terms.paymentFrequency,
    years: mortgageScheduleYears(rows),
    extra: effect
      ? {
          amount: perPayment,
          lumpSum: lump?.amount ?? null,
          lumpDate: lump?.date ?? null,
          payoffDate: effect.payoffDate,
          interestSaved: effect.interestSaved,
        }
      : null,
  };
}

/** The rows of the payment schedule in one calendar year, with the actual payment of each past row. */
export function mortgageScheduleOfYear(db: Db, accountId: string, asOf: string, year: number) {
  return mortgageRowsOfYear(matchedSchedule(db, accountId, asOf).rows, year);
}
