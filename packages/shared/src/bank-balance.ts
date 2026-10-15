import { z } from "zod";
import { accountClass, type AccountKind } from "./account";
import { isoDateSchema } from "./date";
import { amountSchema } from "./money";
import { openingSuggestionSchema } from "./opening";
import { isUtcTimestamp } from "./time";

export const bankBalanceInputSchema = z.object({
  date: isoDateSchema,
  balance: amountSchema,
});

export const bankBalanceSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  date: isoDateSchema,
  balance: amountSchema,
  importBatchId: z.uuid().nullable(),
  createdAt: z.string().refine(isUtcTimestamp),
});

/** The latest bank balance of an account against the calculated balance on its date. */
export const bankStatusSchema = z.object({
  accountId: z.uuid(),
  date: isoDateSchema,
  bankBalance: amountSchema,
  calculatedBalance: amountSchema,
  difference: amountSchema,
  openingSuggestion: openingSuggestionSchema.nullable(),
});

export const bankBalanceListSchema = z.object({
  items: z.array(bankBalanceSchema),
  status: bankStatusSchema.nullable(),
});

export const bankStatusListSchema = z.object({
  items: z.array(bankStatusSchema),
});

/** A balance that a person reads on a bank screen (an amount owed is positive) becomes stored money. */
export function storedBankBalance(kind: AccountKind, printed: number): number {
  return accountClass(kind) === "liability" ? -printed : printed;
}

export function printedBankBalance(kind: AccountKind, stored: number): number {
  return accountClass(kind) === "liability" ? -stored : stored;
}

export type BankBalance = z.infer<typeof bankBalanceSchema>;
export type BankBalanceInput = z.infer<typeof bankBalanceInputSchema>;
export type BankStatus = z.infer<typeof bankStatusSchema>;
