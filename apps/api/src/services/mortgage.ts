import { accounts, categories, mortgageTerms, valuations } from "@num/db";
import {
  mortgageExtraEffect,
  mortgageNextPayments,
  mortgageSchedule,
  mortgageSplitForDate,
  type MortgagePrefill,
  type MortgageTerms,
  type MortgageTermsWrite,
  type MortgageValuation,
  type MortgageView,
} from "@num/shared";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { balanceOf } from "./account-balance";
import { ServiceError } from "../service-error";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

type TermRow = typeof mortgageTerms.$inferSelect;

function snapshot(row: TermRow): MortgageTerms {
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

function requireMortgage(db: Db | WriteTx, accountId: string) {
  const account = db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) {
    throw new ServiceError("account_not_found", 404);
  }
  if (account.kind !== "mortgage") {
    throw new ServiceError("not_mortgage", 400);
  }
  return account;
}

function assertTerms(db: Db | WriteTx, accountId: string, input: MortgageTermsWrite) {
  if (input.firstPaymentDate < input.principalAsOf || input.termEnd < input.firstPaymentDate) {
    throw new ServiceError("mortgage_terms_invalid", 400);
  }
  const payment = db.select().from(accounts).where(eq(accounts.id, input.paymentAccountId)).get();
  if (!payment || payment.archivedAt !== null || payment.id === accountId) {
    throw new ServiceError("payment_account_invalid", 400);
  }
  const category = db.select().from(categories).where(eq(categories.id, input.interestCategoryId)).get();
  if (!category || category.archivedAt !== null || category.kind !== "expense") {
    throw new ServiceError("interest_category_invalid", 400);
  }
  if (input.propertyAccountId === null) {
    return;
  }
  const property = db.select().from(accounts).where(eq(accounts.id, input.propertyAccountId)).get();
  if (!property || property.archivedAt !== null || property.kind !== "property" || property.id === accountId) {
    throw new ServiceError("property_account_invalid", 400);
  }
}

function activeValuations(db: Db | WriteTx, accountId: string): MortgageValuation[] {
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
  return snapshot(row);
}

export function saveMortgageTerms(db: Db, accountId: string, input: MortgageTermsWrite & WriteInput): MortgageTerms {
  return write(db, { source: input.source, at: input.at }, (tx) => {
    const account = requireMortgage(tx, accountId);
    if (account.archivedAt !== null) {
      throw new ServiceError("account_archived", 409);
    }
    assertTerms(tx, accountId, input);
    const existing = tx.select().from(mortgageTerms).where(eq(mortgageTerms.accountId, accountId)).get();
    const values = {
      accountId,
      principal: input.principal,
      principalAsOf: input.principalAsOf,
      rateMilliPct: input.rateMilliPct,
      compounding: input.compounding,
      paymentAmount: input.paymentAmount,
      paymentFrequency: input.paymentFrequency,
      firstPaymentDate: input.firstPaymentDate,
      termEnd: input.termEnd,
      amortizationMonthsRemaining: input.amortizationMonthsRemaining,
      paymentAccountId: input.paymentAccountId,
      interestCategoryId: input.interestCategoryId,
      propertyAccountId: input.propertyAccountId,
    };
    if (existing) {
      tx.update(mortgageTerms).set(values).where(eq(mortgageTerms.accountId, accountId)).run();
    } else {
      tx.insert(mortgageTerms).values(values).run();
    }
    const saved = tx.select().from(mortgageTerms).where(eq(mortgageTerms.accountId, accountId)).get();
    if (!saved) {
      throw new ServiceError("mortgage_terms_not_found", 404);
    }
    tx.audit({
      entity: "mortgage_terms",
      entityId: accountId,
      action: existing ? "update" : "create",
      before: existing ? snapshot(existing) : null,
      after: snapshot(saved),
    });
    return snapshot(saved);
  });
}

function actualPayments(db: Db, accountId: string): MortgageView["actualPayments"] {
  const rows = db.all<{ id: string; date: string; amount: number }>(sql`
    select t.id as id, t.date as date, -t.amount as amount
    from transactions t
    where 1 = 1
      and t.mirror = 0
      and t.amount < 0
      and exists (
        select 1 from transaction_lines l
        where l.transaction_id = t.id and l.transfer_account_id = ${accountId}
      )
    order by t.date asc, t.id asc
  `);
  return rows.map((row) => ({ id: row.id, date: row.date, amount: row.amount }));
}

export function mortgageAccountView(
  db: Db,
  accountId: string,
  asOf: string,
  options: { extra?: number; lumpSum?: number; lumpDate?: string },
): MortgageView {
  const account = requireMortgage(db, accountId);
  const terms = getMortgageTerms(db, accountId);
  const checkpoints = activeValuations(db, accountId);
  const schedule = mortgageSchedule(terms, checkpoints);
  const perPayment = options.extra ?? 0;
  const lump = options.lumpSum && options.lumpSum > 0 && options.lumpDate ? { date: options.lumpDate, amount: options.lumpSum } : null;
  const effect = perPayment > 0 || lump ? mortgageExtraEffect(terms, checkpoints, { perPayment, lumpSum: lump }) : null;
  return {
    balance: balanceOf(db, { id: account.id, kind: "mortgage", openingBalance: account.openingBalance }, undefined, undefined, asOf),
    rateMilliPct: terms.rateMilliPct,
    payoffDate: schedule.payoffDate,
    totalInterest: schedule.totalInterest,
    termEnd: terms.termEnd,
    paymentAmount: terms.paymentAmount,
    paymentFrequency: terms.paymentFrequency,
    nextPayments: mortgageNextPayments(schedule, asOf, 6),
    payments: schedule.payments,
    actualPayments: actualPayments(db, accountId),
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

function mortgagePaidFrom(db: Db, fromAccountId: string): string | null {
  const rows = db.select().from(mortgageTerms).where(eq(mortgageTerms.paymentAccountId, fromAccountId)).all();
  if (rows.length !== 1) {
    return null;
  }
  return rows[0]?.accountId ?? null;
}

export function mortgagePrefill(db: Db, fromAccountId: string, toAccountId: string | undefined, date: string): MortgagePrefill | null {
  const targetId = toAccountId ?? mortgagePaidFrom(db, fromAccountId);
  if (!targetId) {
    return null;
  }
  const account = db.select().from(accounts).where(eq(accounts.id, targetId)).get();
  if (!account || account.kind !== "mortgage") {
    return null;
  }
  const row = db.select().from(mortgageTerms).where(eq(mortgageTerms.accountId, targetId)).get();
  if (!row) {
    return null;
  }
  const split = mortgageSplitForDate({
    terms: snapshot(row),
    valuations: activeValuations(db, targetId),
    date,
    fromAccountId,
    toAccountId: targetId,
  });
  if (!split || split.payment < 1) {
    return null;
  }
  return { ...split, mortgageAccountId: targetId };
}
