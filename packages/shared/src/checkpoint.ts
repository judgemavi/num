import { z } from "zod";
import { accountClass, type AccountKind } from "./account";
import { isoDateSchema } from "./date";
import { openingSuggestionSchema } from "./opening";
import { isUtcTimestamp } from "./time";
import { amountSchema } from "./money";
import { queryFlag, queryNumber } from "./list";


export const checkpointCreateSchema = z.object({
  date: isoDateSchema,
  statementBalance: amountSchema,
});

/** The query of the compare read: the same two values as a checkpoint, in the URL. */
export const checkpointCompareQuerySchema = z.object({
  date: isoDateSchema,
  statementBalance: queryNumber().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
});

export const checkpointSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  date: isoDateSchema,
  statementBalance: amountSchema,
  createdAt: z.string().refine(isUtcTimestamp),
  unlockedAt: z.string().refine(isUtcTimestamp).nullable(),
});

export const checkpointHelpRowSchema = z.object({
  id: z.uuid(),
  date: isoDateSchema,
  payee: z.string(),
  amount: amountSchema,
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

export function storedStatementBalance(kind: AccountKind, printed: number): number {
  return accountClass(kind) === "liability" ? -printed : printed;
}

export function printedStatementBalance(kind: AccountKind, stored: number): number {
  return accountClass(kind) === "liability" ? -stored : stored;
}

export const checkpointCompareSchema = z.object({
  balanced: z.boolean(),
  calculatedBalance: amountSchema,
  statementBalance: amountSchema,
  difference: amountSchema,
  help: z.array(checkpointHelpSchema),
  openingSuggestion: openingSuggestionSchema.nullable(),
});

export const closingHintSchema = z.object({
  closingDate: isoDateSchema.nullable(),
  closingBalance: amountSchema.nullable(),
});

/** The checkpoints of an account and the closing balance of the last imported statement (decision 0039). */
export const checkpointListSchema = z.object({
  items: z.array(checkpointSchema),
  closing: closingHintSchema,
});

export const accountActivityQuerySchema = z.object({
  page: queryNumber().min(1).default(1),
  reconcile: queryFlag,
});

export type Checkpoint = z.infer<typeof checkpointSchema>;
export type CheckpointHelp = z.infer<typeof checkpointHelpSchema>;
export type CheckpointCompare = z.infer<typeof checkpointCompareSchema>;
export type CheckpointCreate = z.infer<typeof checkpointCreateSchema>;
export type ClosingHint = z.infer<typeof closingHintSchema>;
export type AccountActivityQuery = z.output<typeof accountActivityQuerySchema>;
