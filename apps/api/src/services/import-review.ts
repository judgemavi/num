import { importBatches, importRows, transactionLines, transactions } from "@num/db";
import { normalizePayee, storedPayee, Temporal, type ImportReviewResolve } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { labelFields } from "./match-apply";
import { loadMatchBook, scorePayee } from "./match-book";
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

function createFromReview(tx: WriteTx, row: ReturnType<typeof requireReview>): string {
  const scored = scorePayee(loadMatchBook(tx), { payee: normalizePayee(row.payeeRaw), amount: row.amount, recurring: null });
  const applied = labelFields(scored, null) ?? {
    merchantId: null,
    categoryId: null,
    autoReason: null,
    autoSourceId: null,
    autoConfidence: null,
  };
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
      autoConfidence: applied.autoConfidence,
      notes: null,
      payeeRaw: payee.payeeRaw,
      payeeNormalized: payee.payeeNormalized,
      status: "open",
      source: "import",
      importRowId: row.id,
      transferPeerId: null,
      mirror: false,
    })
    .run();
  tx.insert(transactionLines)
    .values({
      id: crypto.randomUUID(),
      transactionId,
      amount: row.amount,
      memo: null,
      categoryId: "categoryId" in applied ? applied.categoryId : null,
      transferAccountId: null,
    })
    .run();
  tx.update(importRows).set({ outcome: "created", transactionId }).where(eq(importRows.id, row.id)).run();
  auditTransaction(tx, transactionId, "create", null, readTransaction(tx, transactionId), {
    suggestionReason: scored.reason ?? "none",
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
  let result: { importRowId: string; transactionId: string } | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
    const row = requireReview(tx, id);
    if (decision.decision === "match") {
      const txn = tx.select().from(transactions).where(eq(transactions.id, decision.transactionId)).get();
      if (
        !txn ||
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
    result = { importRowId: row.id, transactionId: createFromReview(tx, row) };
  });
  if (!result) {
    throw new Error("Review did not return a transaction");
  }
  return result;
}
