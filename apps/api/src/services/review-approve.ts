import { transactions } from "@num/db";
import { utcNow, type BulkSkip, type Suggestion } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { applyToRow, planSkip, type BulkPatch } from "./bulk-edit";
import { answerNoCategory, isUncategorized, recordKeep } from "./decision-keep";
import { linkAutomatic } from "./auto-link";
import { listNeedsReview, type NeedsReviewHit } from "./needs-review";
import { auditTransaction, readTransaction } from "./transaction-record";
import { confirmLinkedPeer, spreadAfterConfirmations } from "./transactions";
import { write, type WriteTx, type WriteInput } from "./write";

const clearedAuto = { autoReason: null, autoSourceId: null, autoConfidence: null };

/** Applies the approval of one row in the write. Null when the row changed; the skip when it stays as it is. */
type Apply = (tx: WriteTx, at: string, peers: Set<string>) => BulkSkip | null;

/** `peers` holds the rows that an earlier row of this batch confirmed with its pair. */
function confirmLabel(tx: WriteTx, id: string, at: string, peers: Set<string>) {
  const existing = tx.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!existing?.autoReason) {
    return peers.has(id);
  }
  const before = readTransaction(tx, id);
  tx.update(transactions).set({ ...clearedAuto, editedAt: at }).where(eq(transactions.id, id)).run();
  auditTransaction(tx, id, "update", before, readTransaction(tx, id));
  // An automatic "no category" becomes a kept row (decision 0046).
  if (isUncategorized(tx, id)) {
    recordKeep(tx, id, at);
  }
  const peer = confirmLinkedPeer(tx, existing, at);
  if (peer) {
    peers.add(peer);
  }
  linkAutomatic(tx, id);
  return true;
}

/** The change that applies the suggestion of a row. */
function suggestionPatch(accountId: string, suggestion: Suggestion): BulkPatch {
  if (suggestion.transferAccountId) {
    const kind = suggestion.mortgage ? "mortgage" : "transfer";
    return { what: { kind, accountId, transferAccountId: suggestion.transferAccountId } };
  }
  return {
    what: suggestion.categoryId ? { kind: "category", categoryId: suggestion.categoryId } : undefined,
    merchantId: suggestion.merchantId ?? undefined,
  };
}

/** What approve does with one row: the skip, or the function that applies the label or the suggestion. */
function approvalOf(db: Db, id: string, hit: NeedsReviewHit | undefined): { skip: BulkSkip } | { apply: Apply } {
  if (!hit) {
    return { skip: { id, reason: "no_suggestion" } };
  }
  if (hit.review.question !== "categorize") {
    return { skip: { id, reason: "question" } };
  }
  if (hit.review.level === "sure") {
    return { apply: (tx, at, peers) => (confirmLabel(tx, id, at, peers) ? null : { id, reason: "no_suggestion" }) };
  }
  const suggestion = hit.review.suggestion;
  if (!suggestion) {
    return { skip: { id, reason: "no_suggestion" } };
  }
  if (suggestion.keep) {
    return {
      apply: (tx, at) => {
        answerNoCategory(tx, id, at);
        return null;
      },
    };
  }
  const patch = suggestionPatch(hit.accountId, suggestion);
  const skip = planSkip(db, id, patch);
  return skip ? { skip } : { apply: (tx, at) => applyToRow(tx, id, patch, at) };
}

/**
 * Approve the selected rows (decision 0051): apply the automatic label or the suggestion of each row as a
 * confirmation. A row with a question or with no suggestion is skipped. One write; each approved row counts as a
 * confirmation for learning.
 */
export function approveSelected(db: Db, asOf: string, ids: readonly string[], input: WriteInput): { approved: number; skipped: BulkSkip[] } {
  const targets = [...new Set(ids)];
  const hits = new Map(listNeedsReview(db, asOf, { only: targets }).map((hit) => [hit.id, hit]));
  const approvals = targets.map((id) => ({ id, approval: approvalOf(db, id, hits.get(id)) }));
  const skipped = approvals.flatMap(({ approval }) => ("skip" in approval ? [approval.skip] : []));
  // A selection in which each row is skipped changes nothing. It has no write and no audit entry.
  if (skipped.length === targets.length) {
    return { approved: 0, skipped };
  }
  const at = input.at ?? utcNow();
  const approved: string[] = [];
  const peers = new Set<string>();
  write(db, { source: input.source, at }, (tx) => {
    for (const { id, approval } of approvals) {
      const skip = "apply" in approval ? approval.apply(tx, at, peers) : null;
      if (skip) {
        skipped.push(skip);
      } else if ("apply" in approval) {
        approved.push(id);
      }
    }
    spreadAfterConfirmations(tx, approved, new Set(), new Set(targets));
  });
  return { approved: approved.length, skipped };
}
