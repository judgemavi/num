import { z } from "zod";
import { isoDateSchema } from "./date";
import { amountSchema } from "./money";

/** Balances use the stored sign: an amount owed is negative. */
export const valuationInputSchema = z.object({
  date: isoDateSchema,
  balance: amountSchema,
  note: z.string().trim().nullable().optional(),
});

export const valuationUpdateSchema = valuationInputSchema.partial();

export const valuationSchema = valuationInputSchema.extend({
  id: z.uuid(),
  accountId: z.uuid(),
  note: z.string().nullable(),
});

export const valuationListSchema = z.object({ items: z.array(valuationSchema) });

export type Valuation = z.infer<typeof valuationSchema>;
export type ValuationInput = z.infer<typeof valuationInputSchema>;
export type ValuationUpdate = z.infer<typeof valuationUpdateSchema>;
