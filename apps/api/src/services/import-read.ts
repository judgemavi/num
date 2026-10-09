import { documents, importBatches, importRows } from "@num/db";
import { unreadableRowSchema, type ImportBatch, type ImportCounts, type UnreadableRow } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import type { WriteTx } from "./write";

type Reader = Db | WriteTx;

type BatchRow = typeof importBatches.$inferSelect;

export function countOutcomes(rows: readonly { outcome: string }[], unreadable: number): ImportCounts {
  return {
    created: rows.filter((row) => row.outcome === "created").length,
    matched: rows.filter((row) => row.outcome === "matched").length,
    duplicate: rows.filter((row) => row.outcome === "duplicate").length,
    needsReview: rows.filter((row) => row.outcome === "needs_review").length,
    unreadable,
  };
}

export function readUnreadable(value: string): UnreadableRow[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((item) => {
      const row = unreadableRowSchema.safeParse(item);
      return row.success ? [row.data] : [];
    });
  } catch {
    return [];
  }
}

export function presentBatch(db: Reader, batch: BatchRow): ImportBatch {
  const rows = db.select({ outcome: importRows.outcome }).from(importRows).where(eq(importRows.batchId, batch.id)).all();
  const document = batch.documentId
    ? db.select({ filename: documents.filename }).from(documents).where(eq(documents.id, batch.documentId)).get()
    : undefined;
  const unreadable = readUnreadable(batch.unreadableJson);
  return {
    id: batch.id,
    accountId: batch.accountId,
    documentId: batch.documentId,
    filename: document?.filename ?? null,
    parser: batch.parser,
    periodStart: batch.periodStart,
    periodEnd: batch.periodEnd,
    closingBalance: batch.closingBalance,
    closingDate: batch.closingDate,
    createdAt: batch.createdAt,
    undoneAt: batch.undoneAt,
    counts: countOutcomes(rows, unreadable.length),
    unreadable,
  };
}

export type { UnreadableRow };
