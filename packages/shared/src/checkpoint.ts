import { z } from "zod";
import { accountClass, type AccountKind } from "./account";
import { isoDateSchema } from "./date";
import { transactionInputStatuses } from "./transaction";
import { isUtcTimestamp } from "./time";

const centsSchema = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);

export const checkpointCreateSchema = z.object({
  date: isoDateSchema,
  statementBalance: centsSchema,
});

export const checkpointSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  date: isoDateSchema,
  statementBalance: centsSchema,
  createdAt: z.string().refine(isUtcTimestamp),
  unlockedAt: z.string().refine(isUtcTimestamp).nullable(),
});

export const checkpointHelpRowSchema = z.object({
  id: z.uuid(),
  date: isoDateSchema,
  payee: z.string(),
  amount: centsSchema,
});

export const checkpointHelpSchema = z.discriminatedUnion("code", [
  z.object({
    code: z.literal("uncleared"),
    transaction: checkpointHelpRowSchema,
  }),
  z.object({
    code: z.literal("duplicate"),
    transactions: z.tuple([checkpointHelpRowSchema, checkpointHelpRowSchema]),
  }),
  z.object({
    code: z.literal("gap"),
    from: isoDateSchema,
    to: isoDateSchema,
  }),
]);

export function storedStatementBalance(kind: AccountKind, printedMinor: number): number {
  return accountClass(kind) === "liability" ? -printedMinor : printedMinor;
}

export function printedStatementBalance(kind: AccountKind, storedMinor: number): number {
  return accountClass(kind) === "liability" ? -storedMinor : storedMinor;
}

export const checkpointCompareSchema = z.object({
  balanced: z.boolean(),
  calculatedBalance: centsSchema,
  statementBalance: centsSchema,
  difference: centsSchema,
  help: z.array(checkpointHelpSchema),
});

export const checkpointListSchema = z.object({
  items: z.array(checkpointSchema),
});

export const closingHintSchema = z.object({
  closingDate: isoDateSchema.nullable(),
  closingBalance: centsSchema.nullable(),
});

export const clearanceSchema = z.object({
  transactionIds: z.array(z.uuid()).min(1).max(200),
  status: z.enum(transactionInputStatuses),
});

export const clearanceResultSchema = z.object({
  updated: z.number().int().min(0),
});

export const accountActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  reconcile: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((value) => value === true || value === "true"),
});

export type Checkpoint = z.infer<typeof checkpointSchema>;
export type CheckpointHelp = z.infer<typeof checkpointHelpSchema>;
export type CheckpointCompare = z.infer<typeof checkpointCompareSchema>;
export type CheckpointCreate = z.infer<typeof checkpointCreateSchema>;
export type ClosingHint = z.infer<typeof closingHintSchema>;
export type Clearance = z.infer<typeof clearanceSchema>;
export type AccountActivityQuery = z.output<typeof accountActivityQuerySchema>;
