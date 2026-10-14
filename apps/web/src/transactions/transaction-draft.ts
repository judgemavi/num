import {
  choiceForCategory,
  amountText,
  merchantForChoice,
  moneyDirection,
  resolveEditorChoice,
  signedAmount,
  parseAmount,
  type Category,
  type MoneyDirection,
  type Transaction,
  type TransactionReview,
} from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { suggestionQuery, transferHintQuery } from "@/api/suggestions";
import { localAsOf } from "@/as-of";
import { useCategories } from "@/editors/lookups";
import { fieldValue } from "@/forms/form-values";
import type { SplitLine } from "@/transactions/what-choice";
import { decimalsError } from "@/money";

/** A change that the form makes, not the person. It does not mark the field as changed and does not start the listeners. */
export const quietChange = { dontUpdateMeta: true, dontRunListeners: true };

export function readPositive(currency: string, text: string): number {
  let milli: number;
  try {
    milli = parseAmount(currency, text.trim());
  } catch {
    throw new Error(decimalsError(currency, text) ?? "Enter the amount as a number.");
  }
  if (milli < 0) {
    throw new Error("Enter a positive amount.");
  }
  return milli;
}

function choiceOf(transaction: Transaction | null, categories: Category[]) {
  if (!transaction) {
    return "spending";
  }
  if (transaction.lines.length > 1) {
    return "split";
  }
  const line = transaction.lines[0];
  if (line?.transferAccountId) {
    return "transfer";
  }
  const kind = categories.find((category) => category.id === line?.categoryId)?.kind ?? null;
  return choiceForCategory(moneyDirection(transaction.amount), kind);
}

/** True when the saved transaction has a category, a transfer or lines. Then the form does not apply a suggestion. */
export function alreadyChosen(transaction: Transaction | null): boolean {
  if (!transaction) {
    return false;
  }
  return transaction.lines.length > 1 || transaction.lines.some((line) => line.categoryId !== null || line.transferAccountId !== null);
}

function linesOf(transaction: Transaction): SplitLine[] {
  const direction = moneyDirection(transaction.amount);
  return transaction.lines.map((line) => ({
    key: line.id,
    amount: amountText(Math.abs(line.amount)),
    opposite: moneyDirection(line.amount) !== direction,
    edited: true,
    categoryId: line.categoryId,
    transferAccountId: line.transferAccountId,
  }));
}

/**
 * The start values of the Transaction form. A saved transaction gives its values. A new transaction starts on
 * `accountId` with today's date. The question of a transaction that needs review fills its proposed answer
 * (decision 0047): a transfer pair gives Transfer to the account of the other transaction, and a refund gives the first
 * candidate purchase. "Payment for…" starts empty, because more than one transaction can be that payment.
 */
export function transactionValues(categories: Category[], transaction: Transaction | null, accountId: string, review: TransactionReview | null = null) {
  const pair = review?.question === "transfer_pair" ? review.transfer : null;
  const purchase = review?.question === "refund_purchase" ? (review.refund?.purchases[0] ?? null) : null;
  return {
    accountId: transaction?.accountId ?? accountId,
    date: transaction?.date ?? localAsOf(),
    direction: transaction ? moneyDirection(transaction.amount) : "out",
    amount: transaction ? amountText(Math.abs(transaction.amount)) : "",
    payee: transaction?.payeeRaw ?? "",
    notes: transaction?.notes ?? "",
    cleared: transaction?.status === "cleared",
    merchantId: transaction && !pair ? transaction.merchantId : null,
    refundOfId: purchase ? purchase.id : transaction ? transaction.refundOfId : null,
    choice: pair ? "transfer" : purchase ? "refund" : choiceOf(transaction, categories),
    categoryId: pair ? null : (transaction?.lines[0]?.categoryId ?? null),
    transferAccountId: pair ? pair.otherAccountId : (transaction?.lines[0]?.transferAccountId ?? null),
    lines: transaction && !pair && transaction.lines.length > 1 ? linesOf(transaction) : [],
    tagIds: [...new Set(transaction?.lines.flatMap((line) => line.tagIds) ?? [])],
    /** True after the form put the lines of a mortgage payment from the schedule. The form does it one time. */
    mortgageFilled: false,
    /** The occurrence that the transaction pays: "planId:dueDate". Only for the question "Which payment is this?". */
    paymentFor: fieldValue<string | null>(null),
  };
}

/** True when the start values are the proposed answer to a question. Then the form does not apply a suggestion. */
export function answerFilled(review: TransactionReview | null): boolean {
  return review?.question === "transfer_pair" || (review?.question === "refund_purchase" && (review.refund?.purchases.length ?? 0) > 0);
}

export type TransactionValues = ReturnType<typeof transactionValues>;

/** The values of a new transaction. A form part made with `withForm` gets the type of the form values from them. */
export const blankTransaction = transactionValues([], null, "");

/**
 * The signed amount of the form. `storedAmount` is the stored amount of an imported transaction or of an amount that
 * the person did not change: it comes back as it is. Null when the amount is not valid.
 */
export function signedTotal(currency: string, storedAmount: number | null, amount: string, direction: MoneyDirection): number | null {
  if (storedAmount !== null) {
    return storedAmount;
  }
  if (amount.trim().length === 0) {
    return null;
  }
  try {
    return signedAmount(direction, readPositive(currency, amount));
  } catch {
    return null;
  }
}

type SuggestionInput = {
  accountId: string;
  payee: string;
  date: string;
  direction: MoneyDirection;
  amount: number | null;
};

/**
 * The suggestion for the form, and the choice that it gives. `choice` is null until the reads that the choice needs
 * complete. It is the same object until the suggestion, the transfer hint or the direction changes.
 */
export function useSuggestion(input: SuggestionInput) {
  const categories = useCategories();
  const { data: suggestion = null } = useQuery(suggestionQuery(input));
  const transferHint = useQuery(transferHintQuery(input));
  const hintReady = input.amount === null || input.amount === 0 || transferHint.isSuccess || transferHint.isError;
  const oppositeAccountId = transferHint.data?.accountId ?? null;
  const { direction } = input;
  const choice = useMemo(() => {
    if (!suggestion || !hintReady) {
      return null;
    }
    const resolved = resolveEditorChoice({
      direction,
      suggestion,
      categoryKind: categories.find((category) => category.id === suggestion.categoryId)?.kind ?? null,
      transferAccountFromRule: suggestion.transferAccountId,
      oppositeAccountId,
    });
    return { ...resolved, merchantId: merchantForChoice(resolved.choice, resolved.merchantId) };
  }, [suggestion, hintReady, direction, categories, oppositeAccountId]);
  return { suggestion, choice };
}
