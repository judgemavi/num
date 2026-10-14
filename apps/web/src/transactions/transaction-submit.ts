import {
  amountText,
  merchantForChoice,
  moneyDirection,
  signedAmount,
  transactionWriteSchema,
  type Transaction,
  type TransactionWrite,
} from "@num/shared";
import type { TransactionSave } from "@/api/transactions";
import { editPatch, keptAmount } from "@/forms/form-values";
import { readPositive, type TransactionValues } from "@/transactions/transaction-draft";
import { lineDirection } from "@/transactions/what-choice";

type SubmitInput = TransactionValues & {
  currency: string;
  transaction: Transaction | null;
  totalMilli: number;
  unreadableItemKey?: string;
};

/** `save` is null when the person changed nothing: the form closes without a write. */
type BuildResult = { ok: true; save: TransactionSave | null } | { ok: false; error: string };

/** The stored transaction as a write body, in the order of the built body. A patch has the fields that differ. */
function storedBody(existing: Transaction): TransactionWrite {
  return {
    accountId: existing.accountId,
    date: existing.date,
    amount: existing.amount,
    merchantId: existing.merchantId,
    notes: existing.notes,
    payeeRaw: existing.payeeRaw,
    status: existing.status,
    lines: existing.lines.map((line) => ({
      amount: line.amount,
      memo: line.memo,
      categoryId: line.categoryId,
      transferAccountId: line.transferAccountId,
      tagIds: line.tagIds,
    })),
    refundOfId: existing.refundOfId,
  };
}

function hasOpenLine(lines: readonly { categoryId?: string | null; transferAccountId?: string | null }[]) {
  return lines.some((line) => !line.categoryId && !line.transferAccountId);
}

/**
 * Make the save for the Transaction editor from the form fields.
 * On a transaction with an automatic label, Save is the answer: the label is confirmed.
 */
export function buildTransactionSave(input: SubmitInput): BuildResult {
  const memoAt = (index: number) => input.transaction?.lines[index]?.memo ?? null;
  // A line amount that the person did not change keeps its stored amount (decision 0040).
  const lineAmount = (index: number, line: SubmitInput["lines"][number]) => {
    const direction = lineDirection(moneyDirection(input.totalMilli), line);
    const stored = input.transaction?.lines[index]?.amount;
    const start =
      stored !== undefined && moneyDirection(stored) === direction ? { text: amountText(Math.abs(stored)), amount: stored } : null;
    return keptAmount(line.amount, start, (text) => signedAmount(direction, readPositive(input.currency, text)));
  };
  let built;
  try {
    built =
      input.choice === "split"
        ? input.lines.map((line, index) => ({
            amount: lineAmount(index, line),
            memo: memoAt(index),
            categoryId: line.categoryId,
            transferAccountId: line.transferAccountId,
            tagIds: input.tagIds,
          }))
        : [
            {
              amount: input.totalMilli,
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
    amount: input.totalMilli,
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
  const labelled = existing.autoReason !== null;
  // Decisions 0024, 0045: a save with no category keeps the row when it needed review or had an automatic label.
  const keep = (labelled || hasOpenLine(existing.lines)) && hasOpenLine(parsed.data.lines);
  const patch = editPatch(parsed.data, storedBody(existing));
  if (!patch && !keep) {
    return { ok: true, save: labelled ? { kind: "confirm", id: existing.id } : null };
  }
  return { ok: true, save: { kind: "update", id: existing.id, body: { ...patch, keepUncategorized: keep }, confirmLabel: labelled } };
}
