import { z } from "zod";
import { Temporal } from "temporal-polyfill";
import { isoDateSchema } from "./date";

const centsSchema = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);

export const openingSuggestionSchema = z.object({
  amount: centsSchema,
  date: isoDateSchema,
});

export type OpeningSuggestion = z.infer<typeof openingSuggestionSchema>;

export function dayBefore(date: string): string {
  return Temporal.PlainDate.from(date).subtract({ days: 1 }).toString();
}

/** Balance and amount are stored cents. A card balance is negative when the statement shows an amount owed. */
export function openingFromFirstRow(input: { balance: number; amount: number; date: string }): OpeningSuggestion | null {
  const amount = input.balance - input.amount;
  if (!Number.isSafeInteger(amount)) {
    return null;
  }
  return { amount, date: dayBefore(input.date) };
}

export function reconcileOpening(input: {
  hasCheckpoint: boolean;
  openingBalance: number;
  calculatedBalance: number;
  statementBalance: number;
  date: string;
}): OpeningSuggestion | null {
  if (input.hasCheckpoint || input.calculatedBalance === input.statementBalance) {
    return null;
  }
  const amount = input.openingBalance - (input.calculatedBalance - input.statementBalance);
  if (!Number.isSafeInteger(amount)) {
    return null;
  }
  return { amount, date: input.date };
}
