import { z } from "zod";
import { isoDateSchema } from "./date";
import { listQuerySchema, optionalQuery, pagedResponseSchema, queryDate, queryId } from "./list";
import { isUtcTimestamp } from "./time";
import { openingSuggestionSchema } from "./opening";
import { presetSchema, unreadableRowSchema } from "./statement";
import { amountSchema } from "./money";


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

const timestampSchema = z.string().refine(isUtcTimestamp);

export const importBatchSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  documentId: z.uuid().nullable(),
  filename: z.string().nullable(),
  parser: z.string(),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  closingBalance: amountSchema.nullable(),
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

export const undoBlockReasons = ["edited"] as const;

export const importUndoSchema = z.object({
  batch: importBatchSchema,
  blocked: z.array(
    z.object({
      rowIndex: z.number().int().nonnegative(),
      date: isoDateSchema,
      amount: amountSchema,
      payeeRaw: z.string(),
      reason: z.enum(undoBlockReasons),
    }),
  ),
});

export type ImportUndo = z.infer<typeof importUndoSchema>;
export type UndoBlockReason = (typeof undoBlockReasons)[number];

export const importViewSortColumns = ["date"] as const;

export const importViewQuerySchema = listQuerySchema(importViewSortColumns).extend({
  accountId: queryId,
  status: optionalQuery(z.enum(importViewStatuses)),
  from: queryDate,
  to: queryDate,
});

export type ImportViewQuery = z.output<typeof importViewQuerySchema>;

export const importViewItemSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  accountName: z.string(),
  documentId: z.uuid().nullable(),
  filename: z.string().nullable(),
  /** The time the file was erased (decision 0041). The record of the document stays. */
  documentDeletedAt: timestampSchema.nullable(),
  /** The transactions that the rows of this import made or matched. They stay when the file is erased. */
  transactionCount: z.number().int().nonnegative(),
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
  amount: amountSchema,
  payeeRaw: z.string(),
  outcome: z.enum(importRowOutcomes),
  transactionId: z.uuid().nullable(),
  duplicateBatchId: z.uuid().nullable(),
  duplicateRowId: z.uuid().nullable(),
  matches: z.array(
    z.object({
      id: z.uuid(),
      date: isoDateSchema,
      amount: amountSchema,
      payeeRaw: z.string(),
    }),
  ),
});

export type ImportDetailRow = z.infer<typeof importDetailRowSchema>;

export const importDetailUnreadableSchema = unreadableRowSchema.extend({
  decision: z.enum(["not_a_transaction"]).nullable(),
});

export const importDetailSchema = z.object({
  item: importViewItemSchema,
  rows: z.array(importDetailRowSchema),
  unreadable: z.array(importDetailUnreadableSchema),
});

export type ImportDetail = z.infer<typeof importDetailSchema>;
