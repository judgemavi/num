import {
  utcNow,
  type GroupSkip,
  type GroupSkipReason,
  type InboxGroupApply,
  type Transaction,
  type TransactionCreate,
} from "@num/shared";
import type { Db } from "../db";
import { linkAutomatic } from "./auto-link";
import { readTransaction } from "./transaction-record";
import { mortgageLinesFor } from "./mortgage-learned";
import { applyTransactionUpdate, spreadAfterConfirmations } from "./transactions";
import { write, type Reader, type WriteTx, type WriteInput } from "./write";

type Patch = Pick<InboxGroupApply, "categoryId" | "transferAccountId" | "merchantId" | "accountId" | "mortgage">;

function skipReason(transaction: Transaction, patch: Patch): GroupSkipReason | null {
  if (transaction.accountId !== patch.accountId) {
    return "other_account";
  }
  if (transaction.lines.length !== 1) {
    return "split";
  }
  const line = transaction.lines[0];
  if (!line || line.categoryId !== null || line.transferAccountId !== null) {
    return "categorized";
  }
  if (patch.transferAccountId && transaction.reconciled) {
    return "reconciled";
  }
  return null;
}

function mortgageBodyFor(transaction: Transaction, lines: NonNullable<ReturnType<typeof mortgageLinesFor>>): TransactionCreate {
  return {
    accountId: transaction.accountId,
    date: transaction.date,
    amount: transaction.amount,
    payeeRaw: transaction.payeeRaw,
    merchantId: null,
    lines,
  };
}

function bodyFor(transaction: Transaction, patch: Patch): TransactionCreate {
  const transferAccountId = patch.transferAccountId;
  const merchantId = transferAccountId ? null : (patch.merchantId ?? transaction.merchantId);
  if (transferAccountId) {
    const line = transaction.lines[0];
    return {
      accountId: transaction.accountId,
      date: transaction.date,
      amount: transaction.amount,
      payeeRaw: transaction.payeeRaw,
      merchantId,
      lines: [
        {
          amount: transaction.amount,
          memo: line?.memo ?? null,
          categoryId: null,
          transferAccountId,
          tagIds: line?.tagIds ?? [],
        },
      ],
    };
  }
  return {
    accountId: transaction.accountId,
    date: transaction.date,
    amount: transaction.amount,
    payeeRaw: transaction.payeeRaw,
    merchantId,
    lines: transaction.lines.map((line) => ({
      amount: line.amount,
      memo: line.memo,
      categoryId: line.categoryId === null && line.transferAccountId === null ? patch.categoryId : line.categoryId,
      transferAccountId: line.transferAccountId,
      tagIds: line.tagIds,
    })),
  };
}

/** The reason why the group action leaves a row as it is, or the new body of the row. A read: it never writes. */
function resolve(db: Reader, id: string, patch: Patch): { skip: GroupSkip } | { body: TransactionCreate } {
  let transaction: Transaction;
  try {
    transaction = readTransaction(db, id);
  } catch {
    return { skip: { id, reason: "categorized" } };
  }
  const reason = skipReason(transaction, patch);
  if (reason) {
    return { skip: { id, reason } };
  }
  const split =
    patch.mortgage && patch.transferAccountId && transaction.amount < 0
      ? mortgageLinesFor(db, patch.transferAccountId, transaction.accountId, transaction.date, transaction.amount)
      : null;
  if (patch.mortgage && !split) {
    return { skip: { id, reason: "no_split" } };
  }
  return { body: split ? mortgageBodyFor(transaction, split) : bodyFor(transaction, patch) };
}

export function applySuggestion(tx: WriteTx, id: string, patch: Patch, at: string): GroupSkip | null {
  const found = resolve(tx, id, patch);
  if ("skip" in found) {
    return found.skip;
  }
  applyTransactionUpdate(tx, id, found.body, at, false);
  linkAutomatic(tx, id);
  return null;
}

/** The skips of a group in which no row can change. Null when a row can change. */
function skipsOfIdleGroup(db: Db, targets: readonly string[], patch: Patch) {
  const skipped: GroupSkip[] = [];
  for (const id of targets) {
    const found = resolve(db, id, patch);
    if (!("skip" in found)) {
      return null;
    }
    skipped.push(found.skip);
  }
  return skipped;
}

export function applyInboxGroup(db: Db, input: InboxGroupApply & WriteInput): { applied: number; skipped: GroupSkip[] } {
  const at = input.at ?? utcNow();
  const targets = [...new Set(input.transactionIds)];
  // A group in which each row is skipped changes nothing. It has no write and no audit entry.
  const idle = skipsOfIdleGroup(db, targets, input);
  if (idle) {
    return { applied: 0, skipped: idle };
  }
  let applied = 0;
  const skipped: GroupSkip[] = [];
  const confirmed: string[] = [];
  write(db, { source: input.source, at }, (tx) => {
    for (const id of targets) {
      const skip = applySuggestion(tx, id, input, at);
      if (skip) {
        skipped.push(skip);
      } else {
        applied += 1;
        confirmed.push(id);
      }
    }
    spreadAfterConfirmations(tx, confirmed, new Set(), new Set(targets));
  });
  return { applied, skipped };
}
