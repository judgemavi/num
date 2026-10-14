import { accounts, mortgageTerms, transactionLines, transactions, valuations } from "@num/db";
import {
  confidenceMilli,
  learnedConfidence,
  mortgagePrefillLines,
  mortgageSplitForDate,
  reviewLevel,
  type LearnedRow,
  type Suggestion,
} from "@num/shared";
import { and, eq, isNull, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { lineCount, literal } from "./transaction-sql";
import type { Reader } from "./write";
import { bookStep } from "./book-step";

const principalLine = alias(transactionLines, "principal_line");
const interestLine = alias(transactionLines, "interest_line");

/** What the user taught for one payee: the mortgage account, and how sure the teaching is. */
export type MortgageLearned = { accountId: string; confidence: number; sourceId: string };

/**
 * Confirmed mortgage payments: from the terms' payment account, exactly two lines (the transfer to the
 * mortgage account and the terms' interest category). Each one teaches its payee.
 */
export function loadMortgageLearned(db: Reader): Map<string, MortgageLearned> {
  const rows = db
    .select({
      id: transactions.id,
      date: transactions.date,
      payee: transactions.payeeNormalized,
      accountId: mortgageTerms.accountId,
    })
    .from(transactions)
    .innerJoin(mortgageTerms, eq(mortgageTerms.paymentAccountId, transactions.accountId))
    .innerJoin(
      principalLine,
      and(eq(principalLine.transactionId, transactions.id), eq(principalLine.transferAccountId, mortgageTerms.accountId)),
    )
    .innerJoin(
      interestLine,
      and(
        eq(interestLine.transactionId, transactions.id),
        eq(interestLine.categoryId, mortgageTerms.interestCategoryId),
        isNull(interestLine.transferAccountId),
      ),
    )
    .where(
      and(
        eq(transactions.mirror, literal(0)),
        lt(transactions.amount, literal(0)),
        isNull(transactions.autoReason),
        eq(lineCount(transactions.id), literal(2)),
      ),
    )
    .all();
  const byPayee = new Map<string, LearnedRow[]>();
  for (const row of rows) {
    const learned: LearnedRow = { id: row.id, date: row.date, categoryId: row.accountId, merchantId: null };
    const list = byPayee.get(row.payee);
    if (list) {
      list.push(learned);
    } else {
      byPayee.set(row.payee, [learned]);
    }
  }
  const found = new Map<string, MortgageLearned>();
  for (const [payee, list] of byPayee) {
    const best = learnedConfidence(list)[0];
    if (best) {
      found.set(payee, { accountId: best.categoryId, confidence: best.confidence, sourceId: best.sourceId });
    }
  }
  return found;
}

/** A mortgage payee that the payee teaches. `similarTo` is the learned payee when the payee only contains it. */
export type MortgageHit = MortgageLearned & { similarTo: string | null };

/** The interest line and the principal line of a payment, from the terms and the schedule. Null when there is no split. */
export function mortgageLinesFor(db: Reader, mortgageAccountId: string, fromAccountId: string, date: string, amount: number) {
  const terms = db.select().from(mortgageTerms).where(eq(mortgageTerms.accountId, mortgageAccountId)).get();
  const account = db.select().from(accounts).where(eq(accounts.id, mortgageAccountId)).get();
  if (!terms || !account?.openingDate || terms.paymentAccountId !== fromAccountId) {
    return null;
  }
  const history = db
    .select({ date: valuations.date, balance: valuations.balance })
    .from(valuations)
    .where(eq(valuations.accountId, mortgageAccountId))
    .all();
  const split = mortgageSplitForDate({
    terms,
    opening: { balance: account.openingBalance, date: account.openingDate },
    valuations: history,
    date,
    fromAccountId,
    toAccountId: mortgageAccountId,
    step: bookStep(db),
  });
  if (!split) {
    return null;
  }
  const fitted = mortgagePrefillLines(split.interest, split.principal, Math.abs(amount));
  if (fitted.principal < 0) {
    return null;
  }
  const sign = amount < 0 ? -1 : 1;
  return [
    { amount: sign * fitted.interest, memo: null, categoryId: split.interestCategoryId, transferAccountId: null, tagIds: [] as string[] },
    { amount: sign * fitted.principal, memo: null, categoryId: null, transferAccountId: mortgageAccountId, tagIds: [] as string[] },
  ];
}

export type MortgageRow = { payee: string; accountId: string; date: string; amount: number };

/** The "Mortgage payment" suggestion for an uncategorized, unreconciled money-out row. Always Likely at most. */
export function mortgageSuggestion(
  db: Reader,
  hit: MortgageHit | null,
  row: MortgageRow,
): Suggestion | null {
  if (!hit || row.amount >= 0 || !mortgageLinesFor(db, hit.accountId, row.accountId, row.date, row.amount)) {
    return null;
  }
  const confidence = confidenceMilli(hit.confidence);
  const level = reviewLevel(false, confidence);
  if (level === "none") {
    return null;
  }
  return {
    merchantId: null,
    categoryId: null,
    transferAccountId: hit.accountId,
    reason: hit.similarTo ? "similar" : "learned_payee",
    level,
    sourceId: hit.sourceId,
    confidence,
    mortgage: true,
    keep: false,
  };
}
