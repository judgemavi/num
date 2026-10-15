import { z } from "zod";
import { isoDateSchema } from "./date";
import { autoReasons } from "./matching";
import { reviewLevels } from "./review-level";
import { amountSchema } from "./money";
import { suggestionSchema } from "./suggest";
import { isUtcTimestamp } from "./time";
import { maxPageSize } from "./list";

const itemKey = z.string().trim().min(1).max(500);

export const reviewQuestions = ["transfer_pair", "recurring_ambiguous", "refund_purchase", "categorize"] as const;

export type ReviewQuestion = (typeof reviewQuestions)[number];

export const reviewTransferSchema = z.object({
  otherId: z.uuid(),
  otherAccountId: z.uuid(),
  otherPayee: z.string(),
  otherAmount: amountSchema,
  otherDate: isoDateSchema,
});

export const reviewRecurringSchema = z.object({
  bucketId: z.uuid(),
  dueDate: isoDateSchema,
});

export const reviewRefundSchema = z.object({
  itemKey,
  purchases: z.array(
    z.object({
      id: z.uuid(),
      date: isoDateSchema,
      amount: amountSchema,
      payeeRaw: z.string(),
    }),
  ),
});

export const transactionReviewSchema = z.object({
  level: z.enum(reviewLevels),
  reason: z.enum(autoReasons).nullable(),
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

export type TransactionReview = z.infer<typeof transactionReviewSchema>;
export type ReviewCounts = z.infer<typeof reviewCountSchema>;

export const inboxDecisionCodes = [
  "not_transfer",
  "keep_plan_amount",
  "not_recurring",
  "not_a_transaction",
  "not_linked",
  "keep_uncategorized",
] as const;

export type InboxDecisionCode = (typeof inboxDecisionCodes)[number];

export const inboxDecisionSchema = z.object({
  itemKey,
  decision: z.enum(inboxDecisionCodes),
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

/**
 * Why approve or bulk edit leaves a selected row as it is.
 * - `loan_payment`: the row (or the other side of its transfer) is a loan payment, with two lines.
 * - `other_account`: a transfer applies only to the rows of its account.
 * - `transfer_target`: the row is in the account that the transfer goes to.
 * - `direction`: an income category on money out.
 * - `refund_linked`: a linked refund takes its category and merchant from the purchase.
 * - `unchanged`: the row already has the values.
 * - `question`, `no_suggestion`: approve has nothing to apply.
 * - `no_split`: the mortgage schedule gives no loan payment lines for the row.
 */
const bulkSkipReasons = [
  "loan_payment",
  "other_account",
  "transfer_target",
  "direction",
  "refund_linked",
  "unchanged",
  "question",
  "no_suggestion",
  "no_split",
] as const;

export type BulkSkipReason = (typeof bulkSkipReasons)[number];

const skippedRowSchema = z.object({
  id: z.uuid(),
  reason: z.enum(bulkSkipReasons),
});

/** The selected rows: one page of the list at most. */
const selectedIds = z.array(z.uuid()).min(1).max(maxPageSize);

export const approveSelectedSchema = z.object({
  transactionIds: selectedIds,
});

export const approveResultSchema = z.object({
  approved: z.number().int().nonnegative(),
  skipped: z.array(skippedRowSchema),
});

/** "What is this?" of the bulk editor: a category, or a transfer from the account of the rows to another account. */
const bulkWhatSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("category"), categoryId: z.uuid() }),
  z.object({ kind: z.literal("transfer"), accountId: z.uuid(), transferAccountId: z.uuid() }),
]);

/**
 * A bulk edit. A field that is not in the body does not change. `merchantId: null` removes the
 * merchant. Tags are added and removed; the edit does not replace all tags of a row.
 */
export const bulkEditSchema = z
  .object({
    transactionIds: selectedIds,
    what: bulkWhatSchema.optional(),
    merchantId: z.uuid().nullable().optional(),
    addTagIds: z.array(z.uuid()).max(100).optional(),
    removeTagIds: z.array(z.uuid()).max(100).optional(),
  })
  .refine(
    (value) =>
      value.what !== undefined || value.merchantId !== undefined || (value.addTagIds?.length ?? 0) > 0 || (value.removeTagIds?.length ?? 0) > 0,
    { message: "Change at least one field." },
  );

export const bulkEditResultSchema = z.object({
  changed: z.number().int().nonnegative(),
  skipped: z.array(skippedRowSchema),
});

export type InboxDecision = z.infer<typeof inboxDecisionSchema>;
export type ImportReviewResolve = z.infer<typeof importReviewResolveSchema>;
export type BulkEdit = z.infer<typeof bulkEditSchema>;
export type BulkSkip = z.infer<typeof skippedRowSchema>;
