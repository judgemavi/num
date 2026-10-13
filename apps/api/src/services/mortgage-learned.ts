import { mortgageTerms, valuations } from "@num/db";
import {
  learnedConfidence,
  mortgagePrefillLines,
  mortgageSplitForDate,
  reviewLevel,
  type Compounding,
  type LearnedRow,
  type PaymentFrequency,
  type Suggestion,
} from "@num/shared";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
type Reader = { all<T>(query: ReturnType<typeof sql>): T[] } & Pick<Db, "select">;

/** What the user taught for one payee: the mortgage account, and how sure the teaching is. */
export type MortgageLearned = { accountId: string; confidence: number; count: number; sourceId: string };

/**
 * Confirmed mortgage payments: from the terms' payment account, exactly two lines (the transfer to the
 * mortgage account and the terms' interest category). Each one teaches its payee.
 */
export function loadMortgageLearned(db: Reader): Map<string, MortgageLearned> {
  const rows = db.all<{ id: string; date: string; payee: string; accountId: string }>(sql`
    select t.id as id, t.date as date, t.payee_normalized as payee, m.account_id as accountId
    from transactions t
    inner join mortgage_terms m on m.payment_account_id = t.account_id
    inner join transaction_lines tl on tl.transaction_id = t.id and tl.transfer_account_id = m.account_id
    inner join transaction_lines il on il.transaction_id = t.id
      and il.category_id = m.interest_category_id and il.transfer_account_id is null
    where 1 = 1
      and t.mirror = 0
      and t.amount < 0
      and t.auto_reason is null
      and (select count(*) from transaction_lines x where x.transaction_id = t.id) = 2
  `);
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
      found.set(payee, { accountId: best.categoryId, confidence: best.confidence, count: best.count, sourceId: best.sourceId });
    }
  }
  return found;
}

/** The interest line and the principal line of a payment, from the terms and the schedule. Null when there is no split. */
export function mortgageLinesFor(db: Reader, mortgageAccountId: string, fromAccountId: string, date: string, amount: number) {
  const terms = db.select().from(mortgageTerms).where(eq(mortgageTerms.accountId, mortgageAccountId)).get();
  if (!terms || terms.paymentAccountId !== fromAccountId) {
    return null;
  }
  const history = db
    .select({ date: valuations.date, balance: valuations.balance })
    .from(valuations)
    .where(eq(valuations.accountId, mortgageAccountId))
    .all();
  const split = mortgageSplitForDate({
    terms: {
      ...terms,
      compounding: terms.compounding as Compounding,
      paymentFrequency: terms.paymentFrequency as PaymentFrequency,
    },
    valuations: history,
    date,
    fromAccountId,
    toAccountId: mortgageAccountId,
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
  hit: MortgageLearned | null,
  row: MortgageRow,
): { suggestion: Suggestion; learnedCount: number } | null {
  if (!hit || row.amount >= 0 || !mortgageLinesFor(db, hit.accountId, row.accountId, row.date, row.amount)) {
    return null;
  }
  const level = reviewLevel(false, hit.confidence);
  if (level === "none") {
    return null;
  }
  return {
    learnedCount: hit.count,
    suggestion: {
      merchantId: null,
      categoryId: null,
      transferAccountId: hit.accountId,
      reason: "learned_payee",
      level,
      sourceId: hit.sourceId,
      sourceName: null,
      confidence: Math.round(hit.confidence * 1000),
      mortgage: true,
    },
  };
}
