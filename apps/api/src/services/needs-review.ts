import { transactions } from "@num/db";
import {
  autoReasons,
  isIsoDate,
  reviewLevel,
  suggestionFromMatch,
  utcNow,
  type AutoReason,
  type ReviewCounts,
  type ReviewLevel,
  type Suggestion,
  type TransactionReview,
} from "@num/shared";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { listOverspent } from "./buckets";
import { listFundingPaychecks } from "./funding-book";
import { decidedKeys } from "./inbox-decisions";
import { applySuggestion } from "./inbox-group";
import { loadMatchBook, scorePayee } from "./match-book";
import { recurringSignals } from "./recurring-view";
import { listTransferPairs } from "./suggestions";
import { auditTransaction, readTransaction } from "./transaction-record";
import { spreadAfterConfirmations } from "./transactions";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = { source: AuditSource; at?: string };

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
};

export type NeedsReviewHit = {
  id: string;
  date: string;
  accountId: string;
  merchantId: string | null;
  review: TransactionReview;
};

const levelOrder: Record<ReviewLevel, number> = { sure: 0, likely: 1, maybe: 2, none: 3 };

const clearedAuto = { autoReason: null, autoSourceId: null, autoConfidence: null };

function requireAsOf(asOf: string) {
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

function pairKey(leftId: string, rightId: string): string {
  return leftId < rightId ? `transfer_pair:${leftId}:${rightId}` : `transfer_pair:${rightId}:${leftId}`;
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
          ) as openLine
        from transactions t
        where t.id in (${list})
      `),
    );
  }
  return found;
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
  };
}

export function listNeedsReview(db: Db, asOf: string): NeedsReviewHit[] {
  requireAsOf(asOf);
  const hidden = decidedKeys(db);
  const signals = recurringSignals(db, asOf);
  const pairs = listTransferPairs(db, asOf).items.filter((pair) => !hidden.has(pairKey(pair.leftId, pair.rightId)));
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
    }
    const confidence = suggestion ? suggestion.confidence / 1000 : null;
    const level = reviewLevel(automatic, confidence);
    const pair = pairById.get(row.id);
    const ambiguous = ambiguousById.get(row.id);
    const amountChanged = changedById.get(row.id);
    const needs =
      automatic || openLine || pair !== undefined || ambiguous !== undefined || amountChanged !== undefined;
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
  const counts: ReviewCounts = { sure: 0, likely: 0, maybe: 0, none: 0 };
  for (const hit of hits) {
    counts[hit.review.level] += 1;
  }
  return counts;
}

export function needsReviewMonths(db: Db, asOf: string): Set<string> {
  return new Set(listNeedsReview(db, asOf).map((hit) => hit.date.slice(0, 7)));
}

export function homeOpenMonths(db: Db, asOf: string): Set<string> {
  requireAsOf(asOf);
  const hidden = decidedKeys(db);
  const months = new Set<string>();
  for (const item of listFundingPaychecks(db).items) {
    if (!hidden.has(`paycheck_funding:${item.incomeTransactionId}`)) {
      months.add(item.date.slice(0, 7));
    }
  }
  for (const item of recurringSignals(db, asOf).missed) {
    months.add(item.dueDate.slice(0, 7));
  }
  if (listOverspent(db).items.length > 0) {
    months.add(asOf.slice(0, 7));
  }
  return months;
}

function confirmSure(tx: WriteTx, id: string, at: string): boolean {
  const existing = tx.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!existing?.autoReason) {
    return false;
  }
  const before = readTransaction(tx, id);
  tx.update(transactions).set({ ...clearedAuto, editedAt: at }).where(eq(transactions.id, id)).run();
  auditTransaction(tx, id, "update", before, readTransaction(tx, id));
  return true;
}

function applyLikely(tx: WriteTx, hit: NeedsReviewHit, at: string): boolean {
  const suggestion = hit.review.suggestion;
  if (!suggestion || hit.review.question !== "categorize") {
    return false;
  }
  const skip = applySuggestion(
    tx,
    hit.id,
    {
      accountId: hit.accountId,
      categoryId: suggestion.categoryId,
      transferAccountId: suggestion.transferAccountId,
      merchantId: suggestion.merchantId ?? hit.merchantId,
    },
    at,
  );
  return skip === null;
}

export function approveReviewLevel(
  db: Db,
  asOf: string,
  level: "sure" | "likely",
  input: WriteInput,
): { level: "sure" | "likely"; count: number; ids: string[] } {
  requireAsOf(asOf);
  const targets = listNeedsReview(db, asOf).filter((hit) => hit.review.level === level);
  const at = input.at ?? utcNow();
  const ids: string[] = [];
  if (targets.length === 0) {
    return { level, count: 0, ids };
  }
  write(db, { source: input.source, at }, (tx) => {
    for (const hit of targets) {
      const applied = level === "sure" ? confirmSure(tx, hit.id, at) : applyLikely(tx, hit, at);
      if (applied) {
        ids.push(hit.id);
      }
    }
    spreadAfterConfirmations(tx, ids);
  });
  return { level, count: ids.length, ids };
}
