import { Temporal } from "temporal-polyfill";
import { z } from "zod";

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  try {
    return Temporal.PlainDate.from(value).toString() === value;
  } catch (error) {
    if (error instanceof RangeError) {
      return false;
    }
    throw error;
  }
}

export const isoDateSchema = z.string().refine(isIsoDate);

export const asOfQuerySchema = z.object({
  asOf: isoDateSchema,
});
