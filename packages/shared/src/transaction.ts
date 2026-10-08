import { z } from "zod";
import { accountKinds } from "./account";
import { isoDateSchema } from "./date";
import { listQuerySchema, pagedResponseSchema } from "./list";
import { isUtcTimestamp } from "./time";

export const transactionStatuses = ["open", "cleared", "reconciled"] as const;

export type TransactionStatus = (typeof transactionStatuses)[number];

export const transactionInputStatuses = ["open", "cleared"] as const;

export type TransactionInputStatus = (typeof transactionInputStatuses)[number];

export const transactionSources = ["import", "manual", "mcp"] as const;

export type TransactionSource = (typeof transactionSources)[number];

const centsSchema = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);

const optionalText = z.string().trim().min(1).nullable().optional();

export const transactionLineInputSchema = z.object({
  amount: centsSchema,
  memo: optionalText,
  categoryId: z.uuid().nullable().optional(),
  transferAccountId: z.uuid().nullable().optional(),
  tagIds: z.array(z.uuid()).optional(),
});

export const transactionLineSchema = z.object({
  id: z.uuid(),
  amount: centsSchema,
  memo: z.string().nullable(),
  categoryId: z.uuid().nullable(),
  transferAccountId: z.uuid().nullable(),
  tagIds: z.array(z.uuid()),
});

const transactionFields = {
  accountId: z.uuid(),
  date: isoDateSchema,
  amount: centsSchema,
  merchantId: z.uuid().nullable().optional(),
  notes: optionalText,
  payeeRaw: z.string().trim().min(1),
  status: z.enum(transactionInputStatuses),
  lines: z.array(transactionLineInputSchema).min(1),
};

export const transactionCreateSchema = z.object(transactionFields);

export const transactionUpdateSchema = z.object(transactionFields);

export const transactionSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  date: isoDateSchema,
  amount: centsSchema,
  merchantId: z.uuid().nullable(),
  notes: z.string().nullable(),
  payeeRaw: z.string(),
  payeeNormalized: z.string(),
  status: z.enum(transactionStatuses),
  source: z.enum(transactionSources),
  importRowId: z.uuid().nullable(),
  transferPeerId: z.uuid().nullable(),
  mirror: z.boolean(),
  deletedAt: z.string().refine(isUtcTimestamp).nullable(),
  lines: z.array(transactionLineSchema),
});

function blankQuery(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
}

const optionalQueryText = z.preprocess(blankQuery, z.string().trim().min(1).optional());
const optionalQueryId = z.preprocess(blankQuery, z.uuid().optional());
const optionalQueryDate = z.preprocess(blankQuery, isoDateSchema.optional());

export const transactionSortColumns = ["date", "amount", "payeeRaw"] as const;

export const transactionListQuerySchema = listQuerySchema(transactionSortColumns).extend({
  q: optionalQueryText,
  accountId: optionalQueryId,
  categoryId: optionalQueryId,
  merchantId: optionalQueryId,
  tagId: optionalQueryId,
  from: optionalQueryDate,
  to: optionalQueryDate,
  uncategorized: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((value) => value === true || value === "true"),
});

export const transactionListItemSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  accountName: z.string(),
  accountKind: z.enum(accountKinds),
  date: isoDateSchema,
  amount: centsSchema,
  payeeRaw: z.string(),
  merchantId: z.uuid().nullable(),
  merchantName: z.string().nullable(),
  status: z.enum(transactionStatuses),
  runningBalance: centsSchema.nullable(),
});

export const transactionListSchema = pagedResponseSchema(transactionListItemSchema);

export type TransactionLineInput = z.infer<typeof transactionLineInputSchema>;
export type TransactionLine = z.infer<typeof transactionLineSchema>;
export type TransactionCreate = z.infer<typeof transactionCreateSchema>;
export type TransactionUpdate = z.infer<typeof transactionUpdateSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type TransactionListQuery = z.output<typeof transactionListQuerySchema>;
export type TransactionListItem = z.infer<typeof transactionListItemSchema>;
