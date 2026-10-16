import { z } from "zod";
import { isoDateSchema } from "./date";
import { amountSchema } from "./money";

/** A liability balance is the positive amount owed at entry. */
export const valuationInputSchema = z.object({
  date: isoDateSchema,
  balance: amountSchema,
  note: z.string().trim().nullable(),
});

export const valuationUpdateSchema = valuationInputSchema.partial();

export const valuationSchema = valuationInputSchema.extend({
  id: z.uuid(),
  accountId: z.uuid(),
});

export const valuationListSchema = z.object({ items: z.array(valuationSchema) });

export type Valuation = z.infer<typeof valuationSchema>;
export type ValuationInput = z.infer<typeof valuationInputSchema>;
export type ValuationUpdate = z.infer<typeof valuationUpdateSchema>;
