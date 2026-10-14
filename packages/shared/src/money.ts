import { z } from "zod";

/** Marks an integer milliunit field so MCP can describe money on that tool only (decision 0038). */
export const amountSchema = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER)
  .meta({ money: true });

export const nonNegativeAmountSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).meta({ money: true });

export const positiveAmountSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).meta({ money: true });
