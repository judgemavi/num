import { categories, transactions } from "@num/db";
import {
  moneyDirection,
  utcNow,
  type BulkEdit,
  type BulkSkip,
  type BulkSkipReason,
  type Transaction,
  type TransactionCreate,
  type TransactionReview,
} from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { linkAutomatic } from "./auto-link";
import { isUncategorized, recordKeep } from "./decision-keep";
import { mortgageLinesFor } from "./mortgage-learned";
import { listNeedsReview } from "./needs-review";
import { recordRefundNo } from "./refund-auto";
import { readTransaction } from "./transaction-record";
import { applyTransactionUpdate, confirmLinkedPeer, spreadAfterConfirmations } from "./transactions";
import { linkTransferPair, recordPairNo } from "./transfer-auto";
import { write, type Reader, type WriteInput, type WriteTx } from "./write";

/** "What is this?" of a bulk edit. Approve also applies a mortgage suggestion: a split from the schedule (decision 0025). */
type BulkWhat = NonNullable<BulkEdit["what"]> | { kind: "mortgage"; accountId: string; transferAccountId: string };

/** The change to each row. A field that is undefined does not change. */
export type BulkPatch = Omit<BulkEdit, "transactionIds" | "what"> & { what?: BulkWhat };

type Plan = { skip: BulkSkip } | { body: TransactionCreate };

function readSelected(db: Reader, id: string): Transaction {
  if (!db.select({ id: transactions.id }).from(transactions).where(eq(transactions.id, id)).get()) {
    throw new ServiceError("transaction_not_found", 404, { id });
  }
  return readTransaction(db, id);
}

function categoryKind(db: Reader, id: string) {
  return db.select({ kind: categories.kind }).from(categories).where(eq(categories.id, id)).get()?.kind ?? null;
}

/** The transfer account of the line after the change. */
function transferAfter(what: BulkWhat | undefined, current: string | null) {
  if (what === undefined) {
    return current;
  }
  return what.kind === "category" ? null : what.transferAccountId;
}

function skipReason(db: Reader, transaction: Transaction, patch: BulkPatch): BulkSkipReason | null {
  const line = transaction.lines[0];
  if (!line || transaction.lines.length !== 1) {
    return "split";
  }
  const what = patch.what;
  if (what && what.kind !== "category") {
    if (transaction.accountId === what.transferAccountId) {
      return "transfer_target";
    }
    if (transaction.accountId !== what.accountId) {
      return "other_account";
    }
  }
  const peer = transaction.transferPeerId ? readTransaction(db, transaction.transferPeerId) : null;
  if (peer && peer.lines.length !== 1) {
    return "split";
  }
  if (transferAfter(what, line.transferAccountId) !== line.transferAccountId && (transaction.reconciled || peer?.reconciled)) {
    return "reconciled";
  }
  // The single editor shows only expense categories for money out (spec §7.3).
  if (what?.kind === "category" && moneyDirection(transaction.amount) === "out" && categoryKind(db, what.categoryId) === "income") {
    return "direction";
  }
  if (transaction.refundOfId !== null && (what?.kind === "category" || patch.merchantId !== undefined)) {
    return "refund_linked";
  }
  return null;
}

function tagsAfter(tagIds: readonly string[], patch: BulkPatch) {
  const removed = new Set(patch.removeTagIds ?? []);
  return [...new Set([...tagIds, ...(patch.addTagIds ?? [])])].filter((id) => !removed.has(id));
}

function header(transaction: Transaction) {
  return { accountId: transaction.accountId, date: transaction.date, amount: transaction.amount, payeeRaw: transaction.payeeRaw };
}

/** The new body of a row with one line. */
function bodyFor(transaction: Transaction, line: Transaction["lines"][number], patch: BulkPatch): TransactionCreate {
  const what = patch.what;
  const transferAccountId = transferAfter(what, line.transferAccountId);
  const categoryId = what === undefined ? line.categoryId : what.kind === "category" ? what.categoryId : null;
  const merchantId = transferAccountId ? null : patch.merchantId === undefined ? transaction.merchantId : patch.merchantId;
  return {
    ...header(transaction),
    merchantId,
    lines: [{ amount: line.amount, memo: line.memo, categoryId, transferAccountId, tagIds: tagsAfter(line.tagIds, patch) }],
  };
}

function sameBody(transaction: Transaction, body: TransactionCreate) {
  const line = transaction.lines[0];
  const next = body.lines[0];
  const sorted = (ids: readonly string[] | undefined) => [...(ids ?? [])].sort().join();
  return (
    line !== undefined &&
    next !== undefined &&
    transaction.merchantId === (body.merchantId ?? null) &&
    line.categoryId === (next.categoryId ?? null) &&
    line.transferAccountId === (next.transferAccountId ?? null) &&
    sorted(line.tagIds) === sorted(next.tagIds)
  );
}

/** True when "What is this?" answers the open question of the row (decision 0047). */
function answersQuestion(patch: BulkPatch, review: TransactionReview | undefined) {
  return patch.what !== undefined && (review?.question === "transfer_pair" || review?.question === "refund_purchase");
}

/** The reason why a row stays as it is, or its new body. A read: it never writes. */
function plan(db: Reader, id: string, patch: BulkPatch, review: TransactionReview | undefined): Plan {
  const transaction = readSelected(db, id);
  const reason = skipReason(db, transaction, patch);
  const line = transaction.lines[0];
  if (reason || !line) {
    return { skip: { id, reason: reason ?? "split" } };
  }
  const what = patch.what;
  if (what?.kind === "mortgage") {
    const lines = transaction.amount < 0 ? mortgageLinesFor(db, what.transferAccountId, transaction.accountId, transaction.date, transaction.amount) : null;
    return lines ? { body: { ...header(transaction), merchantId: null, lines } } : { skip: { id, reason: "no_split" } };
  }
  const body = bodyFor(transaction, line, patch);
  // With no change, a row with an automatic label confirms the label and a row with a question gets the answer.
  if (transaction.autoReason === null && !answersQuestion(patch, review) && sameBody(transaction, body)) {
    return { skip: { id, reason: "unchanged" } };
  }
  return { body };
}

/** The reason why a row stays as it is. Null when the change applies to the row. A read: it never writes. */
export function planSkip(db: Reader, id: string, patch: BulkPatch, review?: TransactionReview): BulkSkip | null {
  const found = plan(db, id, patch, review);
  return "skip" in found ? found.skip : null;
}

/** True when the change accepts the proposed transfer pair: a transfer to the account of the other row. */
function acceptsPair(patch: BulkPatch, review: TransactionReview | undefined) {
  return review?.question === "transfer_pair" && review.transfer !== null && patch.what?.kind === "transfer" && patch.what.transferAccountId === review.transfer.otherAccountId;
}

/**
 * The "no" answer of an open question when the change answers it another way, as the single editor does
 * (decision 0047): a possible transfer records `not_transfer`, a refund with no purchase records `not_linked`.
 */
function recordNoAnswer(tx: WriteTx, id: string, patch: BulkPatch, review: TransactionReview | undefined, at: string) {
  if (!review || !answersQuestion(patch, review)) {
    return;
  }
  if (review.transfer) {
    recordPairNo(tx, id, review.transfer.otherId, at);
  }
  if (review.question === "refund_purchase" && readTransaction(tx, id).refundOfId === null) {
    recordRefundNo(tx, id, at);
  }
}

/** Apply the change to one row in the write. Null when the row changed; the skip when it stays as it is. */
export function applyToRow(tx: WriteTx, id: string, patch: BulkPatch, at: string, review?: TransactionReview): BulkSkip | null {
  const found = plan(tx, id, patch, review);
  if ("skip" in found) {
    return found.skip;
  }
  const existing = tx.select().from(transactions).where(eq(transactions.id, id)).get();
  if (review?.transfer && acceptsPair(patch, review)) {
    linkTransferPair(tx, id, review.transfer.otherId, at);
    const linked = readTransaction(tx, id);
    const line = linked.lines[0];
    const body = line ? bodyFor(linked, line, patch) : null;
    if (body && !sameBody(linked, body)) {
      applyTransactionUpdate(tx, id, body, at, { spread: false, confirm: true });
    }
  } else {
    applyTransactionUpdate(tx, id, found.body, at, { spread: false, confirm: true });
    recordNoAnswer(tx, id, patch, review, at);
  }
  // A confirmed automatic "no category" becomes a kept row (decision 0046). A confirmed automatic pair confirms both rows.
  if (existing?.autoReason && isUncategorized(tx, id)) {
    recordKeep(tx, id, at);
  }
  if (existing?.transferPeerId && readTransaction(tx, id).transferPeerId === existing.transferPeerId) {
    confirmLinkedPeer(tx, existing, at);
  }
  linkAutomatic(tx, id);
  return null;
}

/**
 * The bulk edit of selected rows (decision 0051). One write for all rows, with one audit entry for each changed row.
 * Each changed row counts as a confirmation for learning. A row that cannot take the change is skipped, with a reason.
 */
export function bulkEdit(db: Db, asOf: string, input: BulkEdit & WriteInput): { changed: number; skipped: BulkSkip[] } {
  const at = input.at ?? utcNow();
  const targets = [...new Set(input.transactionIds)];
  const patch: BulkPatch = { what: input.what, merchantId: input.merchantId, addTagIds: input.addTagIds, removeTagIds: input.removeTagIds };
  if (patch.what?.kind === "transfer" && patch.what.accountId === patch.what.transferAccountId) {
    throw new ServiceError("transfer_same_account", 400);
  }
  const reviews = new Map(listNeedsReview(db, asOf, { only: targets }).map((hit) => [hit.id, hit.review]));
  const first = targets.map((id) => planSkip(db, id, patch, reviews.get(id)));
  // A selection in which each row is skipped changes nothing. It has no write and no audit entry.
  if (first.every((skip) => skip !== null)) {
    return { changed: 0, skipped: first.filter((skip) => skip !== null) };
  }
  const skipped: BulkSkip[] = [];
  const changed: string[] = [];
  write(db, { source: input.source, at }, (tx) => {
    for (const id of targets) {
      const skip = applyToRow(tx, id, patch, at, reviews.get(id));
      if (skip) {
        skipped.push(skip);
      } else {
        changed.push(id);
      }
    }
    spreadAfterConfirmations(tx, changed, new Set(), new Set(targets));
  });
  return { changed: changed.length, skipped };
}
