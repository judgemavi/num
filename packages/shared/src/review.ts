import { z } from "zod";
import { isoDateSchema } from "./date";
import { autoReasons } from "./matching";
import { centsSchema } from "./money";
import { suggestionSchema } from "./suggest";

export const reviewLevels = ["sure", "likely", "maybe", "none"] as const;

export type ReviewLevel = (typeof reviewLevels)[number];

export const reviewQuestions = ["transfer_pair", "recurring_ambiguous", "recurring_changed", "categorize"] as const;

export type ReviewQuestion = (typeof reviewQuestions)[number];

export const reviewTransferSchema = z.object({
  otherId: z.uuid(),
  otherPayee: z.string(),
  otherAmount: centsSchema,
  otherDate: isoDateSchema,
  itemKey: z.string(),
});

export const reviewRecurringSchema = z.object({
  planId: z.uuid(),
  dueDate: isoDateSchema,
  expectedAmount: centsSchema.nullable(),
  actualAmount: centsSchema.nullable(),
  itemKey: z.string(),
  transactionIds: z.array(z.uuid()),
});

export const transactionReviewSchema = z.object({
  level: z.enum(reviewLevels),
  reason: z.enum(autoReasons).nullable(),
  learnedCount: z.number().int().min(0).nullable(),
  question: z.enum(reviewQuestions),
  suggestion: suggestionSchema.nullable(),
  itemKey: z.string().nullable(),
  transfer: reviewTransferSchema.nullable(),
  recurring: reviewRecurringSchema.nullable(),
});

export const reviewCountSchema = z.object({
  sure: z.number().int().nonnegative(),
  likely: z.number().int().nonnegative(),
  maybe: z.number().int().nonnegative(),
  none: z.number().int().nonnegative(),
});

export const approveLevels = ["sure", "likely"] as const;

export const approveLevelSchema = z.object({
  level: z.enum(approveLevels),
});

export const approveLevelResultSchema = z.object({
  level: z.enum(approveLevels),
  count: z.number().int().nonnegative(),
  ids: z.array(z.uuid()),
});

export type TransactionReview = z.infer<typeof transactionReviewSchema>;
export type ReviewCounts = z.infer<typeof reviewCountSchema>;
export type ApproveLevel = z.infer<typeof approveLevelSchema>;
