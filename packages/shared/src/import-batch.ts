import { z } from "zod";
import { isoDateSchema } from "./date";
import { isUtcTimestamp } from "./time";
import { unreadableRowSchema } from "./statement";

const centsSchema = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);

export const importCountsSchema = z.object({
  created: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative(),
  duplicate: z.number().int().nonnegative(),
  needsReview: z.number().int().nonnegative(),
  unreadable: z.number().int().nonnegative(),
});

export type ImportCounts = z.infer<typeof importCountsSchema>;

const timestampSchema = z.string().refine(isUtcTimestamp);

export const importBatchSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  documentId: z.uuid().nullable(),
  filename: z.string().nullable(),
  parser: z.string(),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  closingBalance: centsSchema.nullable(),
  closingDate: isoDateSchema.nullable(),
  createdAt: timestampSchema,
  undoneAt: timestampSchema.nullable(),
  counts: importCountsSchema,
});

export type ImportBatch = z.infer<typeof importBatchSchema>;

export const importListSchema = z.object({
  items: z.array(importBatchSchema),
});

export const importPresetListSchema = z.object({
  presets: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
});

export const importedBatchSchema = importBatchSchema.extend({
  kind: z.literal("batch"),
  alreadyImported: z.boolean(),
  unreadable: z.array(unreadableRowSchema),
});

export const importPreviewSchema = z.object({
  kind: z.literal("preview"),
  rows: z.array(z.array(z.string())),
});

export const importUnreadableSchema = z.object({
  kind: z.literal("unreadable"),
  unreadable: z.array(unreadableRowSchema),
});

export const importResultSchema = z.discriminatedUnion("kind", [
  importPreviewSchema,
  importUnreadableSchema,
  importedBatchSchema,
]);

export type ImportResult = z.infer<typeof importResultSchema>;

export const undoBlockReasons = ["edited", "reconciled"] as const;

export const importUndoSchema = z.object({
  batch: importBatchSchema,
  blocked: z.array(
    z.object({
      rowIndex: z.number().int().nonnegative(),
      date: isoDateSchema,
      amount: centsSchema,
      payeeRaw: z.string(),
      reason: z.enum(undoBlockReasons),
    }),
  ),
});

export type ImportUndo = z.infer<typeof importUndoSchema>;
export type UndoBlockReason = (typeof undoBlockReasons)[number];
