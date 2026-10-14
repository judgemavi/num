import { z } from "zod";
import { accountKinds } from "./account";
import { isoDateSchema } from "./date";
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

export const transactionCreateSchema = z.object({
  ...transactionFields,
  unreadableItemKey: z.string().trim().min(1).max(500).optional(),
});

export const transactionUpdateSchema = z.object({
  ...transactionFields,
  keepUncategorized: z.boolean().optional(),
});

export const transactionWriteSchema = transactionUpdateSchema;

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

export const transactionListQuerySchema = listQuerySchema(transactionSortColumns)
  .extend(transactionFilterSchema.shape)
  .extend({ needsReview: queryFlag });

export const transactionListApiQuerySchema = transactionListQuerySchema.extend({
  asOf: queryDate,
});

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

export const transactionListSchema = pagedResponseSchema(transactionListItemSchema).extend({
  reviewCounts: reviewCountSchema.nullable(),
});

export type TransactionFilter = z.output<typeof transactionFilterSchema>;
export type TransactionLineInput = z.infer<typeof transactionLineInputSchema>;
export type TransactionLine = z.infer<typeof transactionLineSchema>;
export type TransactionCreate = z.infer<typeof transactionCreateSchema>;
export type TransactionUpdate = z.infer<typeof transactionUpdateSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type TransactionListQuery = z.output<typeof transactionListQuerySchema>;
export type TransactionListItem = z.infer<typeof transactionListItemSchema>;
