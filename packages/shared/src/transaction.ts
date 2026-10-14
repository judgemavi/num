import { z } from "zod";
import { accountKinds } from "./account";
import { asOfQuerySchema, isoDateSchema } from "./date";
import { approveLevels } from "./review";
import { listQuerySchema, pagedResponseSchema, queryDate, queryFlag, queryId, queryIdOrNone, queryText } from "./list";
import { autoReasons } from "./matching";
import { amountSchema } from "./money";
import { reviewCountSchema, transactionReviewSchema } from "./review";

export const transactionStatuses = ["open", "cleared"] as const;

export type TransactionStatus = (typeof transactionStatuses)[number];

export const transactionInputStatuses = ["open", "cleared"] as const;

export type TransactionInputStatus = (typeof transactionInputStatuses)[number];

export const transactionSources = ["import", "manual", "mcp"] as const;

export type TransactionSource = (typeof transactionSources)[number];


const optionalText = z.string().trim().min(1).nullable().optional();

export const transactionLineInputSchema = z
  .object({
    amount: amountSchema,
    memo: optionalText,
    categoryId: z.uuid().nullable().optional(),
    transferAccountId: z.uuid().nullable().optional(),
    tagIds: z.array(z.uuid()).optional(),
  })
  .refine((line) => line.categoryId == null || line.transferAccountId == null, { path: ["categoryId"] });

export const transactionLineSchema = z.object({
  id: z.uuid(),
  amount: amountSchema,
  memo: z.string().nullable(),
  categoryId: z.uuid().nullable(),
  transferAccountId: z.uuid().nullable(),
  tagIds: z.array(z.uuid()),
});

const transactionFields = {
  accountId: z.uuid(),
  date: isoDateSchema,
  amount: amountSchema,
  merchantId: z.uuid().nullable().optional(),
  notes: optionalText,
  payeeRaw: z.string().trim().min(1),
  status: z.enum(transactionInputStatuses),
  lines: z.array(transactionLineInputSchema).min(1),
  refundOfId: z.uuid().nullable().optional(),
};

/** All the fields of a transaction write. The API checks a merged PATCH with it. */
export const transactionWriteSchema = z.object(transactionFields);

export const transactionCreateSchema = transactionWriteSchema.extend({
  unreadableItemKey: z.string().trim().min(1).max(500).optional(),
});

/**
 * The Needs review question that the editor showed with the transaction (decision 0047). The saved fields give the
 * answer:
 * - `transfer_pair`: one transfer line to the account of `otherId` accepts the pair. Other lines record `not_transfer`.
 * - `refund_purchase`: a refund with a purchase links it. No purchase records `not_linked`.
 * - `recurring_ambiguous`: the transaction is the payment of the occurrence. Send it only when the person chose it.
 */
export const reviewAnswerSchema = z.discriminatedUnion("question", [
  z.object({ question: z.literal("transfer_pair"), otherId: z.uuid(), asOf: isoDateSchema }),
  z.object({ question: z.literal("refund_purchase") }),
  z.object({ question: z.literal("recurring_ambiguous"), planId: z.uuid(), dueDate: isoDateSchema }),
]);

/**
 * A PATCH body: only the fields that change. `lines` replaces all the lines. `keepUncategorized` records the answer
 * "keep uncategorized" (decision 0024) and `answer` gives the answer to a Needs review question; they are not fields.
 */
export const transactionUpdateSchema = transactionWriteSchema.partial().extend({
  keepUncategorized: z.boolean().optional(),
  answer: reviewAnswerSchema.optional(),
});

export const transactionSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  date: isoDateSchema,
  amount: amountSchema,
  merchantId: z.uuid().nullable(),
  notes: z.string().nullable(),
  payeeRaw: z.string(),
  payeeNormalized: z.string(),
  status: z.enum(transactionStatuses),
  reconciled: z.boolean(),
  source: z.enum(transactionSources),
  importRowId: z.uuid().nullable(),
  transferPeerId: z.uuid().nullable(),
  mirror: z.boolean(),
  autoReason: z.enum(autoReasons).nullable(),
  autoSourceId: z.uuid().nullable(),
  autoConfidence: z.number().int().min(0).max(1000).nullable(),
  refundOfId: z.uuid().nullable(),
  refundOf: z
    .object({
      id: z.uuid(),
      date: isoDateSchema,
      amount: amountSchema,
      payeeRaw: z.string(),
    })
    .nullable(),
  refundedAmount: amountSchema.nullable(),
  lines: z.array(transactionLineSchema),
});

export const transactionSortColumns = ["date", "amount", "payeeRaw"] as const;

export const transactionFilterSchema = z.object({
  q: queryText,
  accountId: queryId,
  categoryId: queryId,
  groupId: queryIdOrNone,
  merchantId: queryIdOrNone,
  tagId: queryIdOrNone,
  from: queryDate,
  to: queryDate,
  uncategorized: queryFlag,
  automatic: queryFlag,
});

export const transactionListQuerySchema = listQuerySchema(transactionSortColumns).extend(transactionFilterSchema.shape);

/** With `asOf`, each row that needs review has its review. */
export const transactionListApiQuerySchema = transactionListQuerySchema.extend({
  asOf: queryDate,
});

/** The Needs review list also sorts by confidence (decision 0049). */
export const reviewSortColumns = [...transactionSortColumns, "confidence"] as const;

/** The Needs review list: the same filters and pages as the transaction list (decision 0047), and one more sort column. */
export const transactionReviewListQuerySchema = listQuerySchema(reviewSortColumns).extend(transactionFilterSchema.shape);

/** The query of the Needs review read: the list query and `asOf`. */
export const transactionReviewQuerySchema = transactionReviewListQuerySchema.extend(asOfQuerySchema.shape);

export const approveLevelSchema = transactionFilterSchema.extend({
  level: z.enum(approveLevels),
  count: z.number().int().nonnegative(),
});

export const transactionListItemSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  accountName: z.string(),
  accountKind: z.enum(accountKinds),
  date: isoDateSchema,
  amount: amountSchema,
  payeeRaw: z.string(),
  merchantId: z.uuid().nullable(),
  merchantName: z.string().nullable(),
  status: z.enum(transactionStatuses),
  reconciled: z.boolean(),
  runningBalance: amountSchema.nullable(),
  autoReason: z.enum(autoReasons).nullable(),
  autoConfidence: z.number().int().min(0).max(1000).nullable(),
  refundOf: z
    .object({
      id: z.uuid(),
      date: isoDateSchema,
      amount: amountSchema,
    })
    .nullable(),
  refundedAmount: amountSchema.nullable(),
  lines: z.array(z.object({ categoryId: z.uuid().nullable(), transferAccountId: z.uuid().nullable() })),
  review: transactionReviewSchema.nullable(),
});

export const transactionListSchema = pagedResponseSchema(transactionListItemSchema);

/** The counts are for all rows that need review and match the filters, on every page. */
export const transactionReviewListSchema = transactionListSchema.extend({
  reviewCounts: reviewCountSchema,
});

/** The review of one transaction. Null when it does not need review. */
export const transactionReviewReadSchema = z.object({
  review: transactionReviewSchema.nullable(),
});

export type TransactionFilter = z.output<typeof transactionFilterSchema>;
export type TransactionLineInput = z.infer<typeof transactionLineInputSchema>;
export type TransactionLine = z.infer<typeof transactionLineSchema>;
export type TransactionCreate = z.infer<typeof transactionCreateSchema>;
export type TransactionUpdate = z.infer<typeof transactionUpdateSchema>;
export type ReviewAnswer = z.infer<typeof reviewAnswerSchema>;
export type TransactionWrite = z.infer<typeof transactionWriteSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type TransactionListQuery = z.output<typeof transactionListQuerySchema>;
export type TransactionReviewListQuery = z.output<typeof transactionReviewListQuerySchema>;
export type TransactionListItem = z.infer<typeof transactionListItemSchema>;
