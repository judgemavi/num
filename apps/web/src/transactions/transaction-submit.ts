import {
  merchantForChoice,
  moneyDirection,
  signedAmount,
  transactionWriteSchema,
  type Transaction,
  type TransactionUpdate as TransactionWrite,
  type WhatChoice,
} from "@num/shared";
import type { TransactionSave } from "@/api/transactions";
import { readPositive } from "@/transactions/transaction-draft";
import { lineDirection, type SplitLine } from "@/transactions/what-choice";

type SubmitInput = {
  currency: string;
  transaction: Transaction | null;
  accountId: string;
  date: string;
  totalMinor: number;
  payee: string;
  notes: string;
  cleared: boolean;
  merchantId: string | null;
  choice: WhatChoice;
  categoryId: string | null;
  transferAccountId: string | null;
  lines: SplitLine[];
  tagIds: string[];
  refundOfId: string | null;
  unreadableItemKey?: string;
};

type BuildResult = { ok: true; save: TransactionSave } | { ok: false; error: string };

function sameTags(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().every((id, index) => id === [...b].sort()[index]);
}

function unchanged(existing: Transaction, body: TransactionWrite): boolean {
  if (
    existing.accountId !== body.accountId ||
    existing.date !== body.date ||
    existing.amount !== body.amount ||
    existing.merchantId !== body.merchantId ||
    (existing.notes ?? null) !== body.notes ||
    existing.payeeRaw !== body.payeeRaw ||
    (existing.status === "cleared") !== (body.status === "cleared") ||
    (existing.refundOfId ?? null) !== (body.refundOfId ?? null) ||
    existing.lines.length !== body.lines.length
  ) {
    return false;
  }
  return existing.lines.every((line, index) => {
    const next = body.lines[index];
    return (
      next !== undefined &&
      line.amount === next.amount &&
      (line.categoryId ?? null) === (next.categoryId ?? null) &&
      (line.transferAccountId ?? null) === (next.transferAccountId ?? null) &&
      sameTags(line.tagIds, next.tagIds ?? [])
    );
  });
}

function hasOpenLine(lines: readonly { categoryId?: string | null; transferAccountId?: string | null }[]): boolean {
  return lines.some((line) => !line.categoryId && !line.transferAccountId);
}

/**
 * Make the save for the Transaction editor from the form fields.
 * On a transaction with an automatic label, Save is the answer: the label is confirmed.
 */
export function buildTransactionSave(input: SubmitInput): BuildResult {
  const memoAt = (index: number) => input.transaction?.lines[index]?.memo ?? null;
  let built;
  try {
    built =
      input.choice === "split"
        ? input.lines.map((line, index) => ({
            amount: signedAmount(lineDirection(moneyDirection(input.totalMinor), line), readPositive(input.currency, line.amount)),
            memo: memoAt(index),
            categoryId: line.categoryId,
            transferAccountId: line.transferAccountId,
            tagIds: input.tagIds,
          }))
        : [
            {
              amount: input.totalMinor,
              memo: memoAt(0),
              categoryId: input.choice === "transfer" ? null : input.categoryId,
              transferAccountId: input.choice === "transfer" ? input.transferAccountId : null,
              tagIds: input.tagIds,
            },
          ];
  } catch (caught) {
    return { ok: false, error: caught instanceof Error ? caught.message : "Check the transaction fields." };
  }
  const body = {
    accountId: input.accountId,
    date: input.date,
    amount: input.totalMinor,
    merchantId: merchantForChoice(input.choice, input.merchantId),
    notes: input.notes.trim().length === 0 ? null : input.notes.trim(),
    payeeRaw: input.payee.trim(),
    status: input.cleared ? "cleared" : "open",
    lines: built,
    refundOfId: input.choice === "refund" ? input.refundOfId : null,
  };
  const parsed = transactionWriteSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "Check the transaction fields." };
  }
  const existing = input.transaction;
  if (!existing) {
    return { ok: true, save: { kind: "create", body: { ...parsed.data, unreadableItemKey: input.unreadableItemKey } } };
  }
  const keep = hasOpenLine(existing.lines) && hasOpenLine(parsed.data.lines);
  const labelled = existing.autoReason !== null;
  if (labelled && !keep && unchanged(existing, parsed.data)) {
    return { ok: true, save: { kind: "confirm", id: existing.id } };
  }
  return { ok: true, save: { kind: "update", id: existing.id, body: { ...parsed.data, keepUncategorized: keep }, confirmLabel: labelled } };
}
