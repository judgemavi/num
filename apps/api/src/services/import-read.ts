import { accounts, importRows, type ImportBatchRow } from "@num/db";
import type { ImportBatch, ImportCounts } from "@num/shared";
import { eq } from "drizzle-orm";
import { balanceChecksOf } from "./import-check";
import type { Reader } from "./write";

export function countOutcomes(rows: readonly { outcome: string }[], unreadable: number): ImportCounts {
  return {
    created: rows.filter((row) => row.outcome === "created").length,
    matched: rows.filter((row) => row.outcome === "matched").length,
    duplicate: rows.filter((row) => row.outcome === "duplicate").length,
    needsReview: rows.filter((row) => row.outcome === "needs_review").length,
    unreadable,
  };
}

export function presentBatch(db: Reader, batch: ImportBatchRow): ImportBatch {
  const rows = db.select({ outcome: importRows.outcome }).from(importRows).where(eq(importRows.batchId, batch.id)).all();
  const account = db.select().from(accounts).where(eq(accounts.id, batch.accountId)).get();
  if (!account) {
    throw new Error("Account is missing");
  }
  const [balanceCheck] = balanceChecksOf(db, [{ ...batch, account }]);
  if (balanceCheck === undefined) {
    throw new Error("Balance check is missing");
  }
  const unreadable = batch.unreadableJson;
  return {
    id: batch.id,
    accountId: batch.accountId,
    filename: batch.filename,
    parser: batch.parser,
    periodStart: batch.periodStart,
    periodEnd: batch.periodEnd,
    closingBalance: batch.closingBalance,
    closingDate: batch.closingDate,
    balanceCheck,
    createdAt: batch.createdAt,
    undoneAt: batch.undoneAt,
    counts: countOutcomes(rows, unreadable.length),
    unreadable,
  };
}
