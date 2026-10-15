import {
  amountText,
  merchantForChoice,
  transactionWriteSchema,
  type ReviewAnswer,
  type Transaction,
  type TransactionReview,
  type TransactionWrite,
} from "@num/shared";
import type { TransactionSave } from "@/api/transactions";
import { editPatch, keptAmount } from "@/forms/form-values";
import { interestLine, readPositive, type TransactionValues } from "@/transactions/transaction-draft";

type SubmitInput = TransactionValues & {
  currency: string;
  transaction: Transaction | null;
  totalMilli: number;
  unreadableItemKey?: string;
  /** The answer to the Needs review question that the form showed. */
  answer?: ReviewAnswer;
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
    payeeRaw: existing.payeeRaw,
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

/**
 * The answer that the save gives to the question of the transaction (decision 0047). The saved fields give the answer:
 * the server accepts the pair, links the purchase, or records the "no". A payment is an answer only when the person
 * chose it.
 */
export function reviewAnswer(review: TransactionReview | null, paymentFor: string | null, asOf: string): ReviewAnswer | undefined {
  switch (review?.question) {
    case "transfer_pair":
      return review.transfer ? { question: "transfer_pair", otherId: review.transfer.otherId, asOf } : undefined;
    case "refund_purchase":
      return { question: "refund_purchase" };
    case "recurring_ambiguous":
      return review.recurring && paymentFor !== null
        ? { question: "recurring_ambiguous", bucketId: review.recurring.bucketId, dueDate: review.recurring.dueDate }
        : undefined;
    default:
      return undefined;
  }
}

function hasOpenLine(lines: readonly { categoryId?: string | null; transferAccountId?: string | null }[]) {
  return lines.some((line) => !line.categoryId && !line.transferAccountId);
}

/**
 * The interest of a loan payment as a negative amount (decision 0053). An interest text that the person did not change
 * keeps its stored amount (decision 0040). It is more than zero and less than the amount.
 */
export function loanInterest(input: Pick<SubmitInput, "currency" | "transaction" | "totalMilli" | "interest">): number {
  const stored = interestLine(input.transaction);
  const start = stored ? { text: amountText(Math.abs(stored.amount)), amount: stored.amount } : null;
  if (input.interest.trim().length === 0) {
    throw new Error("Enter the interest.");
  }
  const interest = keptAmount(input.interest, start, (text) => -readPositive(input.currency, text));
  if (interest === 0) {
    throw new Error("Enter the interest.");
  }
  if (interest <= input.totalMilli) {
    throw new Error("The interest must be less than the amount.");
  }
  return interest;
}

/** The lines of a loan payment: the interest on its category and the principal on the transfer to the loan account. */
function loanLines(input: SubmitInput) {
  if (!input.transferAccountId) {
    throw new Error("Choose the loan account.");
  }
  const interest = loanInterest(input);
  if (!input.interestCategoryId) {
    throw new Error("Choose the interest category.");
  }
  const lines = [
    { amount: interest, categoryId: input.interestCategoryId, transferAccountId: null },
    { amount: input.totalMilli - interest, categoryId: null, transferAccountId: input.transferAccountId },
  ];
  // The lines keep their stored order: an unchanged loan payment is not a change.
  const stored = input.transaction?.lines ?? [];
  const ordered = stored.length === 2 && stored[0]?.transferAccountId !== null ? [...lines].reverse() : lines;
  return ordered.map((line, index) => ({ ...line, memo: stored[index]?.memo ?? null, tagIds: input.tagIds }));
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
      input.choice === "loan_payment"
        ? loanLines(input)
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
    payeeRaw: input.payee.trim(),
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
  const { answer } = input;
  if (!patch && !keep && !answer) {
    return { ok: true, save: labelled ? { kind: "confirm", id: existing.id } : null };
  }
  return { ok: true, save: { kind: "update", id: existing.id, body: { ...patch, keepUncategorized: keep, answer }, confirmLabel: labelled } };
}
