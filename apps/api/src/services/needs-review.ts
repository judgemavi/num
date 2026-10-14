import {
  isIsoDate,
  reviewLevel,
  suggestionFromMatch,
  type RecurringSignals,
  type ReviewCounts,
  type ReviewLevel,
  type Suggestion,
  type TransactionReview,
} from "@num/shared";
import { transactions } from "@num/db";
import { and, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { keepKey } from "./decision-keep";
import { decidedKeys, pairKey } from "./decision-keys";
import { loadMatchBook, mortgageLearnedFor, scorePayee } from "./match-book";
import { refundQuestions } from "./refund-auto";
import { recurringSignals } from "./recurring-view";
import { mortgageSuggestion } from "./mortgage-learned";
import { listTransferPairs } from "./suggestions";
import { hasOpenLine, isReconciled, lineCount } from "./transaction-sql";

type Base = ReturnType<typeof loadBases>[number];

export type NeedsReviewHit = {
  id: string;
  date: string;
  accountId: string;
  merchantId: string | null;
  review: TransactionReview;
};

export function requireAsOf(asOf: string) {
  if (!isIsoDate(asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf });
  }
}

export function chunks<T>(values: readonly T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size));
  }
  return groups;
}

function loadBases(db: Db, ids: readonly string[]) {
  return chunks([...new Set(ids)], 400).flatMap((group) =>
    db
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        date: transactions.date,
        amount: transactions.amount,
        payeeRaw: transactions.payeeRaw,
        payee: transactions.payeeNormalized,
        merchantId: transactions.merchantId,
        autoReason: transactions.autoReason,
        openLine: sql<boolean>`${hasOpenLine(transactions.id)}`.mapWith(Boolean),
        lineCount: lineCount(transactions.id),
        reconciled: isReconciled(transactions),
      })
      .from(transactions)
      .where(inArray(transactions.id, group))
      .all(),
  );
}

/** Sure and Likely are bulk levels. A row has one only when the bulk action can apply it. */
function rowLevel(row: Base, automatic: boolean, suggestion: Suggestion | null) {
  const level = reviewLevel(automatic, suggestion ? suggestion.confidence : null);
  if (level !== "likely") {
    return level;
  }
  const canApply = row.lineCount === 1 && !(suggestion?.transferAccountId && row.reconciled);
  return canApply ? "likely" : "maybe";
}

function emptyReview(level: ReviewLevel, reason: TransactionReview["reason"]): TransactionReview {
  return {
    level,
    reason,
    question: "categorize",
    suggestion: null,
    itemKey: null,
    transfer: null,
    recurring: null,
    refund: null,
  };
}

/**
 * The rows that need review. `signals` and `pairs` are the review sources when the caller has them already.
 * `only` limits the rows to these ids: the review sources stay the same, but only these rows get a score.
 */
export function listNeedsReview(
  db: Db,
  asOf: string,
  scope: { signals?: RecurringSignals; pairs?: { leftId: string; rightId: string }[]; only?: readonly string[] } = {},
): NeedsReviewHit[] {
  requireAsOf(asOf);
  const hidden = decidedKeys(db);
  const only = scope.only ? new Set(scope.only) : null;
  const wanted = (id: string) => only === null || only.has(id);
  const signals = scope.signals ?? recurringSignals(db, asOf);
  const pairs = (scope.pairs ?? listTransferPairs(db, asOf).items).filter((pair) => !hidden.has(pairKey(pair.leftId, pair.rightId)));
  const pairById = new Map<string, { otherId: string; itemKey: string }>();
  for (const pair of pairs) {
    const itemKey = pairKey(pair.leftId, pair.rightId);
    pairById.set(pair.leftId, { otherId: pair.rightId, itemKey });
    pairById.set(pair.rightId, { otherId: pair.leftId, itemKey });
  }
  const ambiguousById = new Map<string, (typeof signals.ambiguous)[number]>();
  for (const item of signals.ambiguous) {
    for (const id of item.transactionIds) {
      if (!ambiguousById.has(id)) {
        ambiguousById.set(id, item);
      }
    }
  }
  const refundById = refundQuestions(db, hidden);
  const open = or(isNotNull(transactions.autoReason), hasOpenLine(transactions.id));
  const openRows = (where: SQL | undefined) => db.select({ id: transactions.id }).from(transactions).where(where).all();
  const openIds = only ? chunks([...only], 400).flatMap((group) => openRows(and(inArray(transactions.id, group), open))) : openRows(open);
  const ids = [...openIds.map((row) => row.id), ...pairById.keys(), ...ambiguousById.keys(), ...refundById.keys()].filter(wanted);
  const otherIds = ids.flatMap((id) => {
    const pair = pairById.get(id);
    return pair ? [pair.otherId] : [];
  });
  const others = new Map(loadBases(db, otherIds).map((row) => [row.id, row]));
  const bases = loadBases(db, ids);
  const book = loadMatchBook(db);
  const scored = new Map<string, Suggestion>();
  const hits: NeedsReviewHit[] = [];
  for (const row of bases) {
    const reason = row.autoReason;
    const automatic = reason !== null;
    let suggestion: Suggestion | null = null;
    if (!automatic && row.openLine) {
      const key = `${row.payee}\u0000${row.amount}`;
      let cached = scored.get(key);
      if (!cached) {
        const result = scorePayee(book, { payee: row.payee, amount: row.amount, recurring: null });
        cached = suggestionFromMatch(result);
        scored.set(key, cached);
      }
      if (cached.categoryId || cached.transferAccountId || cached.keep) {
        suggestion = cached;
      }
      const mortgage = row.lineCount === 1 && !row.reconciled ? mortgageSuggestion(db, mortgageLearnedFor(book, row.payee), row) : null;
      if (mortgage && (suggestion === null || mortgage.confidence > suggestion.confidence)) {
        suggestion = mortgage;
      }
    }
    const pair = pairById.get(row.id);
    const ambiguous = ambiguousById.get(row.id);
    const refundAsk = refundById.get(row.id);
    const asksQuestion = pair !== undefined || ambiguous !== undefined || refundAsk !== undefined;
    const level = asksQuestion ? "none" : rowLevel(row, automatic, suggestion);
    const kept = row.openLine && hidden.has(keepKey(row.id));
    const needs = automatic || (row.openLine && !kept) || asksQuestion;
    if (!needs) {
      continue;
    }
    const review = emptyReview(level, reason);
    if (pair) {
      const other = others.get(pair.otherId);
      if (!other) {
        throw new Error("The other side of the pair is missing");
      }
      review.question = "transfer_pair";
      review.itemKey = pair.itemKey;
      review.transfer = {
        otherId: other.id,
        otherAccountId: other.accountId,
        otherPayee: other.payeeRaw,
        otherAmount: other.amount,
        otherDate: other.date,
      };
    } else if (ambiguous) {
      review.question = "recurring_ambiguous";
      review.itemKey = `recurring_ambiguous:${ambiguous.planId}:${ambiguous.dueDate}`;
      review.recurring = { planId: ambiguous.planId, dueDate: ambiguous.dueDate };
    } else if (refundAsk) {
      review.question = "refund_purchase";
      review.itemKey = refundAsk.itemKey;
      review.refund = refundAsk;
    } else {
      review.suggestion = suggestion;
      // "Yes" to a "no category" suggestion is the keep decision (decision 0046).
      review.itemKey = suggestion?.keep ? keepKey(row.id) : null;
    }
    hits.push({ id: row.id, date: row.date, accountId: row.accountId, merchantId: row.merchantId, review });
  }
  return hits;
}

export function reviewCounts(hits: readonly NeedsReviewHit[]): ReviewCounts {
  const counts: ReviewCounts = { sure: 0, likely: 0, maybe: 0, none: 0, questions: 0 };
  for (const hit of hits) {
    if (hit.review.question === "categorize") {
      counts[hit.review.level] += 1;
    } else {
      counts.questions += 1;
    }
  }
  return counts;
}

export type ReviewState = {
  signals: RecurringSignals;
  hits: NeedsReviewHit[];
};

/** Reads the review sources once so one request does not compute them again. */
export function loadReviewState(db: Db, asOf: string): ReviewState {
  requireAsOf(asOf);
  const signals = recurringSignals(db, asOf);
  const pairs = listTransferPairs(db, asOf).items;
  return {
    signals,
    hits: listNeedsReview(db, asOf, { signals, pairs }),
  };
}
