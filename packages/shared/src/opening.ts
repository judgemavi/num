import { z } from "zod";
import { Temporal } from "temporal-polyfill";
import { isoDateSchema } from "./date";
import { amountSchema } from "./money";


export const openingSuggestionSchema = z.object({
  amount: amountSchema,
  date: isoDateSchema,
});

export type OpeningSuggestion = z.infer<typeof openingSuggestionSchema>;

export function dayBefore(date: string): string {
  return Temporal.PlainDate.from(date).subtract({ days: 1 }).toString();
}

/** Balance and amount are stored money. A card balance is negative when the statement shows an amount owed. */
export function openingFromFirstRow(input: { balance: number; amount: number; date: string }): OpeningSuggestion | null {
  const amount = input.balance - input.amount;
  if (!Number.isSafeInteger(amount)) {
    return null;
  }
  return { amount, date: dayBefore(input.date) };
}

/** The opening balance that makes the calculated balance equal the bank balance (opening balance + the difference). */
export function openingFromBankBalance(input: {
  hasMatchingBankBalance: boolean;
  openingBalance: number;
  calculatedBalance: number;
  bankBalance: number;
  date: string;
}): OpeningSuggestion | null {
  if (input.hasMatchingBankBalance || input.calculatedBalance === input.bankBalance) {
    return null;
  }
  const amount = input.openingBalance - (input.calculatedBalance - input.bankBalance);
  if (!Number.isSafeInteger(amount)) {
    return null;
  }
  return { amount, date: input.date };
}
