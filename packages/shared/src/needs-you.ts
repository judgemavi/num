import { z } from "zod";
import { isoDateSchema } from "./date";
import { monthKeySchema } from "./month";
import { amountSchema as money } from "./money";

const nonNegative = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** A transaction that needs review for more than this number of days is old. */
export const reviewAgeDays = 7;

/** An on-budget account whose last import is older than this number of days is stale. */
export const staleImportDays = 10;

/**
 * The items of Home "Needs you". The list has only the items that need the user: each item is a
 * check that fails. The order is the order of the list on Home.
 */
const needsYouItemSchema = z.discriminatedUnion("code", [
  /** Transactions need review. `oldCount` is the number older than `reviewAgeDays`. */
  z.object({ code: z.literal("review"), count: nonNegative, oldCount: nonNegative }),
  /** One account that does not match its bank (spec §5.13). */
  z.object({ code: z.literal("bank_mismatch"), accountId: z.uuid(), difference: money }),
  /** The on-budget accounts whose last import is older than `staleImportDays`. */
  z.object({ code: z.literal("imports_stale"), items: z.array(z.object({ accountId: z.uuid(), ageDays: nonNegative })) }),
  /** One missed occurrence of a commitment or an income (spec §7.4). */
  z.object({ code: z.literal("missed"), bucketId: z.uuid(), dueDate: isoDateSchema }),
  /** Buckets that stay below zero after the fill (spec §7.7). */
  z.object({ code: z.literal("overspent"), count: nonNegative, balance: z.number().int().max(0) }),
  /** The goals and sinking funds need more each month than the monthly income has (spec §7.8). */
  z.object({ code: z.literal("goals_short"), shortfall: nonNegative }),
  /** One bill with a short part: the part of its gap that Unassigned does not cover (spec §10 Bills). */
  z.object({ code: z.literal("bills_short"), bucketId: z.uuid(), dueDate: isoDateSchema, short: nonNegative }),
  /** The emergency fund is below its target. `months` is the number of months of essential spending of the target. */
  z.object({ code: z.literal("emergency_fund"), balance: money, target: nonNegative, months: nonNegative }),
  /** The savings buckets gave money back to Unassigned this month: the total, and each savings and covered bucket. */
  z.object({
    code: z.literal("savings_used"),
    total: nonNegative,
    items: z.array(z.object({ bucketId: z.uuid(), coveredId: z.uuid(), amount: nonNegative })),
  }),
  /**
   * The forecast pool goes below zero on `date` by `short`. The buckets to pause, the buckets that would give money
   * back, and the part that no bucket gives.
   */
  z.object({
    code: z.literal("pool_short"),
    date: isoDateSchema,
    short: nonNegative,
    pause: z.array(z.object({ bucketId: z.uuid(), monthly: nonNegative })),
    recede: z.array(z.object({ bucketId: z.uuid(), amount: nonNegative })),
    uncovered: nonNegative,
  }),
  /** The complete months with a savings rate below 0%. */
  z.object({
    code: z.literal("savings_rate"),
    months: z.array(z.object({ month: monthKeySchema, savingsRateMilliPct: z.number().int().nullable() })),
  }),
]);

export const needsYouSchema = z.object({
  asOf: isoDateSchema,
  items: z.array(needsYouItemSchema),
});

export type NeedsYou = z.infer<typeof needsYouSchema>;
export type NeedsYouItem = z.infer<typeof needsYouItemSchema>;
