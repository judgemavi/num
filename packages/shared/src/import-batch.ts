import { z } from "zod";
import { isoDateSchema } from "./date";
import { listQuerySchema, pagedResponseSchema } from "./list";
import { isUtcTimestamp } from "./time";
import { openingSuggestionSchema } from "./opening";
import { presetSchema, unreadableRowSchema } from "./statement";

const centsSchema = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);

export const importCountsSchema = z.object({
  created: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative(),
  duplicate: z.number().int().nonnegative(),
  needsReview: z.number().int().nonnegative(),
  unreadable: z.number().int().nonnegative(),
});

export type ImportCounts = z.infer<typeof importCountsSchema>;

export const importViewStatuses = ["imported", "undone", "needs_you"] as const;

export type ImportViewStatus = (typeof importViewStatuses)[number];

export const importRowOutcomes = ["created", "matched", "needs_review", "duplicate", "ignored"] as const;

export type ImportRowOutcome = (typeof importRowOutcomes)[number];

export function importBatchStatus(input: {
  undoneAt: string | null;
  needsReview: number;
  batchId: string;
  unreadableLines: readonly number[];
  dismissedKeys: ReadonlySet<string>;
}): ImportViewStatus {
  if (input.undoneAt !== null) {
    return "undone";
  }
  const unreadableOpen = input.unreadableLines.some(
    (line) => !input.dismissedKeys.has(`import_unreadable:${input.batchId}:${line}`),
  );
  if (input.needsReview > 0 || unreadableOpen) {
    return "needs_you";
  }
  return "imported";
}

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
  unreadable: z.array(unreadableRowSchema),
});

export type ImportBatch = z.infer<typeof importBatchSchema>;

export const importListSchema = z.object({
  items: z.array(importBatchSchema),
});

export const importPresetListSchema = z.object({
  presets: z.array(presetSchema),
});

export const importedBatchSchema = importBatchSchema.extend({
  kind: z.literal("batch"),
  alreadyImported: z.boolean(),
  openingSuggestion: openingSuggestionSchema.nullable(),
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

function blankQuery(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
}

const optionalQueryId = z.preprocess(blankQuery, z.uuid().optional());
const optionalQueryDate = z.preprocess(blankQuery, isoDateSchema.optional());

export const importViewSortColumns = ["date"] as const;

export const importViewQuerySchema = listQuerySchema(importViewSortColumns).extend({
  accountId: optionalQueryId,
  status: z.preprocess(blankQuery, z.enum(importViewStatuses).optional()),
  from: optionalQueryDate,
  to: optionalQueryDate,
});

export type ImportViewQuery = z.output<typeof importViewQuerySchema>;

export const importViewItemSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  accountName: z.string(),
  documentId: z.uuid().nullable(),
  filename: z.string().nullable(),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  createdAt: timestampSchema,
  status: z.enum(importViewStatuses),
  counts: importCountsSchema,
});

export type ImportViewItem = z.infer<typeof importViewItemSchema>;

export const importViewListSchema = pagedResponseSchema(importViewItemSchema);

export const importDetailRowSchema = z.object({
  id: z.uuid(),
  rowIndex: z.number().int().nonnegative(),
  date: isoDateSchema,
  amount: centsSchema,
  payeeRaw: z.string(),
  outcome: z.enum(importRowOutcomes),
  transactionId: z.uuid().nullable(),
  duplicateBatchId: z.uuid().nullable(),
  duplicateRowId: z.uuid().nullable(),
});

export type ImportDetailRow = z.infer<typeof importDetailRowSchema>;

export const importDetailSchema = z.object({
  item: importViewItemSchema,
  rows: z.array(importDetailRowSchema),
  unreadable: z.array(unreadableRowSchema),
});

export type ImportDetail = z.infer<typeof importDetailSchema>;
