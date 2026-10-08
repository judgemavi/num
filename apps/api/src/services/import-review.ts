import { importBatches, importRows, transactionLines, transactions } from "@num/db";
import { storedAutomatic, storedPayee, Temporal, type ImportReviewResolve, type Suggestion } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { suggestForPayee } from "./suggestions";
import { auditTransaction, readTransaction } from "./transaction-record";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

function withinThreeDays(left: string, right: string): boolean {
  const days = Temporal.PlainDate.from(left).until(Temporal.PlainDate.from(right), { largestUnit: "day" }).days;
  return Math.abs(days) <= 3;
}

function requireReview(tx: WriteTx, id: string) {
  const row = tx.select().from(importRows).where(eq(importRows.id, id)).get();
  if (!row || row.outcome !== "needs_review" || !row.active) {
    throw new ServiceError("import_review_not_found", 404);
  }
  const batch = tx.select().from(importBatches).where(eq(importBatches.id, row.batchId)).get();
  if (!batch || batch.undoneAt) {
    throw new ServiceError("import_review_not_found", 404);
  }
  return row;
}

function createFromReview(tx: WriteTx, row: ReturnType<typeof requireReview>, suggestion: Suggestion): string {
  const applied = storedAutomatic(suggestion);
  const transactionId = crypto.randomUUID();
  const payee = storedPayee(row.payeeRaw);
  tx.insert(transactions)
    .values({
      id: transactionId,
      accountId: row.accountId,
      date: row.date,
      amount: row.amount,
      merchantId: applied.merchantId,
      autoReason: applied.autoReason,
      autoSourceId: applied.autoSourceId,
      notes: null,
      payeeRaw: payee.payeeRaw,
      payeeNormalized: payee.payeeNormalized,
      status: "open",
      source: "import",
      importRowId: row.id,
      transferPeerId: null,
      mirror: false,
      deletedAt: null,
    })
    .run();
  tx.insert(transactionLines)
    .values({
      id: crypto.randomUUID(),
      transactionId,
      amount: row.amount,
      memo: null,
      categoryId: applied.categoryId,
      transferAccountId: null,
    })
    .run();
  tx.update(importRows).set({ outcome: "created", transactionId }).where(eq(importRows.id, row.id)).run();
  auditTransaction(tx, transactionId, "create", null, readTransaction(tx, transactionId), {
    suggestionReason: suggestion.reason,
  });
  return transactionId;
}

export function resolveImportReview(
  db: Db,
  id: string,
  decision: ImportReviewResolve,
  input: WriteInput,
): { importRowId: string; transactionId: string } {
  const preview = db.select().from(importRows).where(eq(importRows.id, id)).get();
  if (!preview || preview.outcome !== "needs_review" || !preview.active) {
    throw new ServiceError("import_review_not_found", 404);
  }
  const suggestion = decision.decision === "create" ? suggestForPayee(db, preview.accountId, preview.payeeRaw) : null;
  let result: { importRowId: string; transactionId: string } | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
    const row = requireReview(tx, id);
    if (decision.decision === "match") {
      const txn = tx.select().from(transactions).where(eq(transactions.id, decision.transactionId)).get();
      if (
        !txn ||
        txn.deletedAt ||
        txn.importRowId ||
        txn.accountId !== row.accountId ||
        txn.amount !== row.amount ||
        !withinThreeDays(txn.date, row.date)
      ) {
        throw new ServiceError("import_match_invalid", 409);
      }
      const before = readTransaction(tx, txn.id);
      tx.update(importRows).set({ outcome: "matched", transactionId: txn.id }).where(eq(importRows.id, row.id)).run();
      tx.update(transactions).set({ importRowId: row.id }).where(eq(transactions.id, txn.id)).run();
      auditTransaction(tx, txn.id, "update", before, readTransaction(tx, txn.id));
      result = { importRowId: row.id, transactionId: txn.id };
      return;
    }
    if (!suggestion) {
      throw new ServiceError("import_review_not_found", 404);
    }
    result = { importRowId: row.id, transactionId: createFromReview(tx, row, suggestion) };
  });
  if (!result) {
    throw new Error("Review did not return a transaction");
  }
  return result;
}
