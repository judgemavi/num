import {
  merchantForChoice,
  normalizePayee,
  signedAmount,
  transactionSaveResultSchema,
  transactionWriteSchema,
  type RuleMatch,
  type Transaction,
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
  always: boolean;
  ruleMatch: RuleMatch;
  rulePattern: string;
};

export type SubmitResult =
  | { ok: true; id: string; skipped: number; applied: number }
  | { ok: false; error: string };

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
  if (input.always && input.choice !== "split") {
    if ((input.choice === "transfer" && !input.transferAccountId) || (input.choice !== "transfer" && !input.categoryId) || input.rulePattern.trim().length === 0) {
      return { ok: false, error: "Choose a category or account for the rule." };
    }
  }
  const body = {
    accountId: input.accountId,
    date: input.date,
    amount: input.totalMinor,
    merchantId: merchantForChoice(input.choice, input.merchantId),
    notes: input.notes.trim().length === 0 ? null : input.notes.trim(),
    payeeRaw: input.payee.trim(),
    status: input.reconciled ? "open" : input.cleared ? "cleared" : "open",
    lines: built,
    ...(input.always && input.choice !== "split"
      ? { rule: { payee: normalizePayee(input.payee), match: input.ruleMatch, pattern: input.rulePattern.trim() } }
      : {}),
  };
  const parsed = transactionWriteSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "Check the transaction fields." };
  }
  const result = await apiRequest(input.transaction ? `/api/transactions/${input.transaction.id}` : "/api/transactions", transactionSaveResultSchema, {
    method: input.transaction ? "PATCH" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parsed.data),
  });
  if (!result.ok) {
    return { ok: false, error: transactionError(result.code) };
  }
  return {
    ok: true,
    id: result.data.id,
    skipped: result.data.skipped?.length ?? 0,
    applied: result.data.applied ?? 0,
  };
}
