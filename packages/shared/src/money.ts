import { z } from "zod";

/** Marks an integer minor-unit field so MCP can describe money on that tool only. */
export const centsSchema = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER)
  .meta({ money: true });

export const nonNegativeCentsSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).meta({ money: true });
