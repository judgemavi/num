import {
  merchantForChoice,
  signedAmount,
  transactionSaveResultSchema,
  transactionSchema,
  transactionWriteSchema,
  type Transaction,
  type TransactionUpdate as TransactionWrite,
  type WhatChoice,
} from "@num/shared";
import { apiRequest } from "@/request";
import { transactionError } from "@/transactions/format";
import { readPositive } from "@/transactions/transaction-draft";
import type { SplitLine } from "@/transactions/what-choice";

type SubmitInput = {
  currency: string;
  transaction: Transaction | null;
  reconciled: boolean;
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

export type SubmitResult =
  | { ok: true; id: string; skipped: number; applied: number }
  | { ok: false; error: string };

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

function looksRight(id: string) {
  return apiRequest(`/api/transactions/${id}/looks-right`, transactionSchema, { method: "POST" });
}

/** On a row that needs review, Save is the answer: the automatic label is confirmed. */
async function saveAsAnswer(existing: Transaction, body: TransactionWrite): Promise<SubmitResult | null> {
  if (!unchanged(existing, body)) {
    return null;
  }
  const result = await looksRight(existing.id);
  return result.ok ? { ok: true, id: result.data.id, skipped: 0, applied: 0 } : { ok: false, error: transactionError(result.code) };
}

export async function submitTransaction(input: SubmitInput): Promise<SubmitResult> {
  const memoAt = (index: number) => input.transaction?.lines[index]?.memo ?? null;
  let built;
  try {
    built =
      input.choice === "split"
        ? input.lines.map((line, index) => ({
            amount: signedAmount(line.direction, readPositive(input.currency, line.amount)),
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
  const keep = input.transaction !== null && hasOpenLine(input.transaction.lines) && hasOpenLine(parsed.data.lines);
  if (input.transaction?.autoReason && !keep) {
    const answered = await saveAsAnswer(input.transaction, parsed.data);
    if (answered) {
      return answered;
    }
  }
  const result = await apiRequest(input.transaction ? `/api/transactions/${input.transaction.id}` : "/api/transactions", transactionSaveResultSchema, {
    method: input.transaction ? "PATCH" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input.transaction ? { ...parsed.data, keepUncategorized: keep } : { ...parsed.data, unreadableItemKey: input.unreadableItemKey }),
  });
  if (!result.ok) {
    return { ok: false, error: transactionError(result.code) };
  }
  if (input.transaction?.autoReason && result.data.autoReason !== null) {
    const confirmed = await looksRight(result.data.id);
    if (!confirmed.ok) {
      return { ok: false, error: transactionError(confirmed.code) };
    }
  }
  return {
    ok: true,
    id: result.data.id,
    skipped: result.data.skipped?.length ?? 0,
    applied: result.data.applied ?? 0,
  };
}
