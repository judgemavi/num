import { z } from "zod";
import { isoDateSchema } from "./date";
import { autoReasons } from "./matching";
import { reviewLevels } from "./review-level";
import { centsSchema } from "./money";
import { suggestionSchema } from "./suggest";
import { isUtcTimestamp } from "./time";

const itemKey = z.string().trim().min(1).max(500);

export const reviewQuestions = ["transfer_pair", "recurring_ambiguous", "recurring_changed", "refund_purchase", "categorize"] as const;

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

export const reviewRefundSchema = z.object({
  itemKey,
  purchases: z.array(
    z.object({
      id: z.uuid(),
      date: isoDateSchema,
      amount: centsSchema,
      payeeRaw: z.string(),
    }),
  ),
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
  refund: reviewRefundSchema.nullable(),
});

export const reviewCountSchema = z.object({
  sure: z.number().int().nonnegative(),
  likely: z.number().int().nonnegative(),
  maybe: z.number().int().nonnegative(),
  none: z.number().int().nonnegative(),
  questions: z.number().int().nonnegative(),
});

export const approveLevels = ["sure", "likely"] as const;

export const approveLevelResultSchema = z.object({
  level: z.enum(approveLevels),
  count: z.number().int().nonnegative(),
  ids: z.array(z.uuid()),
});

export type TransactionReview = z.infer<typeof transactionReviewSchema>;
export type ReviewCounts = z.infer<typeof reviewCountSchema>;

export const inboxDecisionCodes = [
  "not_transfer",
  "keep_plan_amount",
  "not_recurring",
  "keep_unassigned",
  "not_a_transaction",
  "not_linked",
  "keep_uncategorized",
] as const;

export type InboxDecisionCode = (typeof inboxDecisionCodes)[number];

export const inboxDecisionSchema = z.object({
  itemKey,
  decision: z.enum(inboxDecisionCodes),
  reason: z.string().nullable(),
  decidedAt: z.string().refine(isUtcTimestamp),
});

export const inboxDecisionListSchema = z.object({
  items: z.array(inboxDecisionSchema),
});

export const inboxDecisionCreateSchema = z.object({
  itemKey,
  decision: z.enum(inboxDecisionCodes),
});

export const inboxDecisionUndoSchema = z.object({
  itemKey,
});

export const importReviewResultSchema = z.object({
  importRowId: z.uuid(),
  transactionId: z.uuid(),
});

export const importReviewResolveSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("match"),
    transactionId: z.uuid(),
  }),
  z.object({
    decision: z.literal("create"),
  }),
]);

export const transferPairAcceptSchema = z.object({
  leftId: z.uuid(),
  rightId: z.uuid(),
});

export const groupSkipReasons = ["split", "reconciled", "other_account", "categorized"] as const;

export type GroupSkipReason = (typeof groupSkipReasons)[number];

export const skippedRowSchema = z.object({
  id: z.uuid(),
  reason: z.enum(groupSkipReasons),
});

export const inboxGroupApplySchema = z
  .object({
    accountId: z.uuid(),
    transactionIds: z.array(z.uuid()).min(1).max(500),
    excludedIds: z.array(z.uuid()).max(500),
    categoryId: z.uuid().nullable(),
    transferAccountId: z.uuid().nullable(),
    merchantId: z.uuid().nullable(),
  })
  .refine((value) => (value.categoryId === null) !== (value.transferAccountId === null));

export const inboxGroupApplyResultSchema = z.object({
  applied: z.number().int().nonnegative(),
  skipped: z.array(skippedRowSchema),
});

export const payeeCountQuerySchema = z.object({
  payee: z.string().trim().min(1).max(200),
  accountId: z.uuid(),
  except: z.string().optional(),
});

export const payeeCountSchema = z.object({
  count: z.number().int().nonnegative(),
});

export type InboxDecision = z.infer<typeof inboxDecisionSchema>;
export type ImportReviewResolve = z.infer<typeof importReviewResolveSchema>;
export type InboxGroupApply = z.infer<typeof inboxGroupApplySchema>;
export type GroupSkip = z.infer<typeof skippedRowSchema>;
