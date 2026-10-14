import {
  autoReasons,
  isIsoDate,
  reviewLevel,
  suggestionFromMatch,
  type AutoReason,
  type RecurringSignals,
  type ReviewCounts,
  type ReviewLevel,
  type Suggestion,
  type TransactionReview,
} from "@num/shared";
import { sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { keepKey } from "./decision-keep";
import { decidedKeys, pairKey } from "./decision-keys";
import { loadMatchBook, mortgageLearnedFor, scorePayee } from "./match-book";
import { refundQuestions } from "./refund-auto";
import { recurringSignals } from "./recurring-view";
import { mortgageSuggestion } from "./mortgage-learned";
import { listTransferPairs } from "./suggestions";
type Base = {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  payeeRaw: string;
  payee: string;
  merchantId: string | null;
  autoReason: string | null;
  openLine: number;
  lineCount: number;
  reconciled: number;
};

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

function asReason(value: string | null): AutoReason | null {
  if (value && (autoReasons as readonly string[]).includes(value)) {
    return value as AutoReason;
  }
  return null;
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size));
  }
  return groups;
}

function loadBases(db: Db, ids: readonly string[]): Base[] {
  const found: Base[] = [];
  for (const group of chunks([...new Set(ids)], 400)) {
    if (group.length === 0) {
      continue;
    }
    const list = sql.join(group.map((id) => sql`${id}`), sql`, `);
    found.push(
      ...db.all<Base>(sql`
        select t.id as id, t.account_id as accountId, t.date as date, t.amount as amount,
          t.payee_raw as payeeRaw, t.payee_normalized as payee, t.merchant_id as merchantId,
          t.auto_reason as autoReason,
          exists (
            select 1 from transaction_lines l
            where l.transaction_id = t.id and l.category_id is null and l.transfer_account_id is null
          ) as openLine,
          (select count(*) from transaction_lines l where l.transaction_id = t.id) as lineCount,
          case when t.date <= (
            select max(c.date) from checkpoints c
            where c.account_id = t.account_id and c.unlocked_at is null
          ) then 1 else 0 end as reconciled
        from transactions t
        where t.id in (${list})
      `),
    );
  }
  return found;
}

/** Sure and Likely are bulk levels. A row has one only when the bulk action can apply it. */
function rowLevel(row: Base, automatic: boolean, suggestion: Suggestion | null): ReviewLevel {
  const level = reviewLevel(automatic, suggestion ? suggestion.confidence / 1000 : null);
  if (level !== "likely") {
    return level;
  }
  const canApply = Number(row.lineCount) === 1 && !(suggestion?.transferAccountId && Number(row.reconciled) === 1);
  return canApply ? "likely" : "maybe";
}

function emptyReview(level: ReviewLevel, reason: AutoReason | null): TransactionReview {
  return {
    level,
    reason,
    learnedCount: null,
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
  const openIds = db.all<{ id: string }>(sql`
    select t.id as id from transactions t
    where t.auto_reason is not null
      or exists (
        select 1 from transaction_lines l
        where l.transaction_id = t.id and l.category_id is null and l.transfer_account_id is null
      )
  `);
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
  const scored = new Map<string, { suggestion: Suggestion; learnedCount: number | null }>();
  const hits: NeedsReviewHit[] = [];
  for (const row of bases) {
    const reason = asReason(row.autoReason);
    const automatic = reason !== null;
    const openLine = Number(row.openLine) === 1;
    let suggestion: Suggestion | null = null;
    let learnedCount: number | null = null;
    if (!automatic && openLine) {
      const key = `${row.payee}\u0000${row.amount}`;
      let cached = scored.get(key);
      if (!cached) {
        const result = scorePayee(book, { payee: row.payee, amount: row.amount, recurring: null });
        cached = { suggestion: suggestionFromMatch(result), learnedCount: result.learnedCount };
        scored.set(key, cached);
      }
      if (cached.suggestion.categoryId || cached.suggestion.transferAccountId) {
        suggestion = cached.suggestion;
        learnedCount = cached.learnedCount;
      }
      const mortgage = Number(row.lineCount) === 1 && Number(row.reconciled) === 0 ? mortgageSuggestion(db, mortgageLearnedFor(book, row.payee), row) : null;
      if (mortgage && (suggestion === null || mortgage.suggestion.confidence > suggestion.confidence)) {
        suggestion = mortgage.suggestion;
        learnedCount = mortgage.learnedCount;
      }
    }
    const pair = pairById.get(row.id);
    const ambiguous = ambiguousById.get(row.id);
    const amountChanged = changedById.get(row.id);
    const refundAsk = refundById.get(row.id);
    const asksQuestion =
      pair !== undefined || ambiguous !== undefined || amountChanged !== undefined || refundAsk !== undefined;
    const level = asksQuestion ? "none" : rowLevel(row, automatic, suggestion);
    const kept = openLine && hidden.has(keepKey(row.id));
    const needs = automatic || (openLine && !kept) || asksQuestion;
    if (!needs) {
      continue;
    }
    const review = emptyReview(level, reason);
    review.learnedCount = learnedCount;
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
