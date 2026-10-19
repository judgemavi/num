import { z } from "zod";
import { dayBefore, isoDateSchema } from "./date";
import { amountSchema } from "./money";


export const openingSuggestionSchema = z.object({
  amount: amountSchema,
  date: isoDateSchema,
});

export type OpeningSuggestion = z.infer<typeof openingSuggestionSchema>;

/** Balance and amount are stored money. A card balance is negative when the statement shows an amount owed. */
export function openingFromFirstRow(input: { balance: number; amount: number; date: string }): OpeningSuggestion | null {
  const amount = input.balance - input.amount;
  if (!Number.isSafeInteger(amount)) {
    return null;
  }
  return { amount, date: dayBefore(input.date) };
}

/** The opening balance that makes the cleared balance equal the bank balance (opening balance + the difference). */
export function openingFromBankBalance(input: {
  hasMatchingBankBalance: boolean;
  openingBalance: number;
  clearedBalance: number;
  bankBalance: number;
  date: string;
}): OpeningSuggestion | null {
  if (input.hasMatchingBankBalance || input.clearedBalance === input.bankBalance) {
    return null;
  }
  const amount = input.openingBalance - (input.clearedBalance - input.bankBalance);
  if (!Number.isSafeInteger(amount)) {
    return null;
  }
  return { amount, date: input.date };
}
