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
import { inArray, isNotNull, or, sql } from "drizzle-orm";
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

const levelOrder: Record<ReviewLevel, number> = { sure: 0, likely: 1, maybe: 2, none: 3 };

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

export function listNeedsReview(
  db: Db,
  asOf: string,
  known?: { signals: RecurringSignals; pairs: { leftId: string; rightId: string }[] },
): NeedsReviewHit[] {
  requireAsOf(asOf);
  const hidden = decidedKeys(db);
  const signals = known?.signals ?? recurringSignals(db, asOf);
  const pairs = (known?.pairs ?? listTransferPairs(db, asOf).items).filter((pair) => !hidden.has(pairKey(pair.leftId, pair.rightId)));
  const changed = signals.changed.filter((item) => !hidden.has(`recurring_changed:${item.planId}:${item.dueDate}`));
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
  const changedById = new Map(changed.map((item) => [item.transactionId, item]));
  const refundById = refundQuestions(db, hidden);
  const openIds = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(or(isNotNull(transactions.autoReason), hasOpenLine(transactions.id)))
    .all();
  const ids = [
    ...openIds.map((row) => row.id),
    ...pairById.keys(),
    ...ambiguousById.keys(),
    ...changedById.keys(),
    ...refundById.keys(),
  ];
  const bases = loadBases(db, ids);
  const byId = new Map(bases.map((row) => [row.id, row]));
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
    const amountChanged = changedById.get(row.id);
    const refundAsk = refundById.get(row.id);
    const asksQuestion =
      pair !== undefined || ambiguous !== undefined || amountChanged !== undefined || refundAsk !== undefined;
    const level = asksQuestion ? "none" : rowLevel(row, automatic, suggestion);
    const kept = row.openLine && hidden.has(keepKey(row.id));
    const needs = automatic || (row.openLine && !kept) || asksQuestion;
    if (!needs) {
      continue;
    }
    const review = emptyReview(level, reason);
    if (pair) {
      const other = byId.get(pair.otherId);
      review.question = "transfer_pair";
      review.itemKey = pair.itemKey;
      review.transfer = {
        otherId: pair.otherId,
        otherPayee: other?.payeeRaw ?? "",
        otherAmount: other?.amount ?? 0,
        otherDate: other?.date ?? row.date,
        itemKey: pair.itemKey,
      };
    } else if (ambiguous) {
      review.question = "recurring_ambiguous";
      review.itemKey = `recurring_ambiguous:${ambiguous.planId}:${ambiguous.dueDate}`;
      review.recurring = {
        planId: ambiguous.planId,
        dueDate: ambiguous.dueDate,
        expectedAmount: null,
        actualAmount: null,
        itemKey: review.itemKey,
        transactionIds: ambiguous.transactionIds,
      };
    } else if (amountChanged) {
      review.question = "recurring_changed";
      review.itemKey = `recurring_changed:${amountChanged.planId}:${amountChanged.dueDate}`;
      review.recurring = {
        planId: amountChanged.planId,
        dueDate: amountChanged.dueDate,
        expectedAmount: amountChanged.expectedAmount,
        actualAmount: amountChanged.actualAmount,
        itemKey: review.itemKey,
        transactionIds: [amountChanged.transactionId],
      };
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
  hits.sort((left, right) => {
    const levelDelta = levelOrder[left.review.level] - levelOrder[right.review.level];
    if (levelDelta !== 0) {
      return levelDelta;
    }
    if (left.date !== right.date) {
      return left.date < right.date ? 1 : -1;
    }
    return left.id < right.id ? -1 : 1;
  });
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
