import { transactions } from "@num/db";
import { utcNow, type TransactionFilter } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { answerNoCategory, isUncategorized, recordKeep } from "./decision-keep";
import { applySuggestion } from "./inbox-group";
import { linkAutomatic } from "./auto-link";
import { requireAsOf, type NeedsReviewHit } from "./needs-review";
import { auditTransaction, readTransaction } from "./transaction-record";
import { filteredReviewHits } from "./transaction-list";
import { confirmLinkedPeer, spreadAfterConfirmations } from "./transactions";
import { write, type WriteTx, type WriteInput, type Reader } from "./write";

type ApproveLevel = "sure" | "likely";

const clearedAuto = { autoReason: null, autoSourceId: null, autoConfidence: null };

/** `peers` holds the rows that an earlier row of this batch confirmed with its pair. */
function confirmSure(tx: WriteTx, id: string, at: string, peers: Set<string>) {
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

function applyLikely(tx: WriteTx, hit: NeedsReviewHit, at: string) {
  const suggestion = hit.review.suggestion;
  if (!suggestion) {
    return false;
  }
  if (suggestion.keep) {
    answerNoCategory(tx, hit.id, at);
    return true;
  }
  const skip = applySuggestion(
    tx,
    hit.id,
    {
      accountId: hit.accountId,
      categoryId: suggestion.categoryId,
      transferAccountId: suggestion.transferAccountId,
      merchantId: suggestion.merchantId ?? hit.merchantId,
      mortgage: suggestion.mortgage,
    },
    at,
  );
  return skip === null;
}

function targetsOf(db: Reader, asOf: string, filter: TransactionFilter, level: ApproveLevel) {
  return filteredReviewHits(db, filter, asOf).filter((hit) => hit.review.question === "categorize" && hit.review.level === level);
}

function changed(count: number) {
  return new ServiceError("review_changed", 409, { count: String(count) });
}

/** Approve every row of one level that matches the filters. The count must match what the person saw. */
export function approveFiltered(
  db: Db,
  asOf: string,
  filter: TransactionFilter,
  level: ApproveLevel,
  expectedCount: number,
  input: WriteInput,
): { level: ApproveLevel; count: number; ids: string[] } {
  requireAsOf(asOf);
  const first = targetsOf(db, asOf, filter, level);
  if (first.length !== expectedCount) {
    throw changed(first.length);
  }
  if (first.length === 0) {
    return { level, count: 0, ids: [] };
  }
  const at = input.at ?? utcNow();
  const ids: string[] = [];
  const peers = new Set<string>();
  write(db, { source: input.source, at }, (tx) => {
    const targets = targetsOf(tx, asOf, filter, level);
    if (targets.length !== expectedCount) {
      throw changed(targets.length);
    }
    for (const hit of targets) {
      if (level === "sure" ? confirmSure(tx, hit.id, at, peers) : applyLikely(tx, hit, at)) {
        ids.push(hit.id);
      }
    }
    if (ids.length !== targets.length) {
      throw changed(ids.length);
    }
    spreadAfterConfirmations(tx, ids, new Set(), new Set(targets.map((hit) => hit.id)));
  });
  return { level, count: ids.length, ids };
}
