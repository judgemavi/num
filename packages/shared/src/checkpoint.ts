import { z } from "zod";
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

export const checkpointHelpSchema = z.discriminatedUnion("code", [
  z.object({
    code: z.literal("uncleared"),
    transactionId: z.uuid(),
  }),
  z.object({
    code: z.literal("duplicate"),
    transactionIds: z.tuple([z.uuid(), z.uuid()]),
  }),
  z.object({
    code: z.literal("gap"),
    from: isoDateSchema,
    to: isoDateSchema,
  }),
]);

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
