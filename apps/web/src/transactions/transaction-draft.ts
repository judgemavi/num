import {
  fromMinorUnits,
  merchantForChoice,
  moneyDirection,
  resolveEditorChoice,
  signedAmount,
  suggestionSchema,
  toMinorUnits,
  transferHintSchema,
  type Category,
  type MoneyDirection,
  type Suggestion,
  type Transaction,
  type WhatChoice,
  choiceForCategory,
} from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/request";
import type { SplitLine } from "@/transactions/what-choice";

export function readPositive(currency: string, text: string): number {
  let minor: number;
  try {
    minor = toMinorUnits(currency, text.trim());
  } catch (error) {
    if (error instanceof Error && error.message === "Amount has too many decimal places") {
      throw new Error("The amount has too many decimal places.");
    }
    throw new Error("Enter the amount as a number.");
  }
  if (minor < 0) {
    throw new Error("Enter a positive amount.");
  }
  return minor;
}

export function choiceOf(transaction: Transaction | null, categories: Category[]): WhatChoice {
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

export function alreadyChosen(transaction: Transaction | null): boolean {
  if (!transaction) {
    return false;
  }
  return transaction.lines.length > 1 || transaction.lines.some((line) => line.categoryId !== null || line.transferAccountId !== null);
}

export function linesOf(currency: string, transaction: Transaction | null, amountText: string, direction: MoneyDirection): SplitLine[] {
  if (transaction && transaction.lines.length > 1) {
    return transaction.lines.map((line) => ({
      key: line.id,
      amount: fromMinorUnits(currency, Math.abs(line.amount)),
      opposite: moneyDirection(line.amount) !== direction,
      edited: true,
      categoryId: line.categoryId,
      transferAccountId: line.transferAccountId,
    }));
  }
  const first = transaction?.lines[0];
  return [
    {
      key: first?.id ?? crypto.randomUUID(),
      amount: amountText,
      opposite: false,
      edited: false,
      categoryId: first?.categoryId ?? null,
      transferAccountId: null,
    },
    { key: crypto.randomUUID(), amount: "", opposite: false, edited: false, categoryId: null, transferAccountId: null },
  ];
}

export function signedTotal(currency: string, imported: boolean, transaction: Transaction | null, amount: string, direction: MoneyDirection): number | null {
  if (imported && transaction) {
    return transaction.amount;
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

type ApplyChoice = {
  accountId: string;
  payee: string;
  date: string;
  direction: MoneyDirection;
  amount: number | null;
  touched: boolean;
  categories: Category[];
  setChoice: (choice: WhatChoice) => void;
  setCategoryId: (id: string | null) => void;
  setTransferAccountId: (id: string | null) => void;
  setMerchantId: (id: string | null) => void;
};

export function useApplySuggestion(input: ApplyChoice): Suggestion | null {
  const suggestion = useQuery({
    queryKey: ["suggestion", input.accountId, input.payee, input.amount, input.date],
    enabled: input.accountId.length > 0 && input.payee.trim().length > 0 && input.amount !== null,
    queryFn: async () => {
      const params = new URLSearchParams({ accountId: input.accountId, payee: input.payee, amount: String(input.amount) });
      if (/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
        params.set("date", input.date);
      }
      const result = await apiRequest(`/api/suggestions?${params.toString()}`, suggestionSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });
  const transferHint = useQuery({
    queryKey: ["transfer-hint", input.accountId, input.date, input.amount],
    enabled: input.accountId.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(input.date) && input.amount !== null && input.amount !== 0,
    queryFn: async () => {
      const params = new URLSearchParams({ accountId: input.accountId, date: input.date, amount: String(input.amount) });
      const result = await apiRequest(`/api/transfer-hint?${params.toString()}`, transferHintSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });
  const suggestionKey = [
    suggestion.data?.reason ?? "",
    suggestion.data?.transferAccountId ?? "",
    suggestion.data?.categoryId ?? "",
    suggestion.data?.merchantId ?? "",
    transferHint.data?.accountId ?? "",
    input.direction,
  ].join("|");
  const [seenSuggestion, setSeenSuggestion] = useState<string | null>(null);
  const hintReady = input.amount === null || input.amount === 0 || transferHint.isSuccess || transferHint.isError;
  if (!input.touched && suggestion.data && hintReady && suggestionKey !== seenSuggestion) {
    setSeenSuggestion(suggestionKey);
    const categoryKind = input.categories.find((category) => category.id === suggestion.data?.categoryId)?.kind ?? null;
    const resolved = resolveEditorChoice({
      direction: input.direction,
      suggestion: suggestion.data,
      categoryKind,
      transferAccountFromRule: suggestion.data.transferAccountId,
      oppositeAccountId: transferHint.data?.accountId ?? null,
    });
    input.setChoice(resolved.choice);
    input.setCategoryId(resolved.categoryId);
    input.setTransferAccountId(resolved.transferAccountId);
    input.setMerchantId(merchantForChoice(resolved.choice, resolved.merchantId));
  }
  return suggestion.data ?? null;
}
