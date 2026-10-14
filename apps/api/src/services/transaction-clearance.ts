import { transactions } from "@num/db";
import { utcNow, type TransactionInputStatus } from "@num/shared";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { transactionReconciled } from "./reconciled";
import { auditTransaction, readTransaction } from "./transaction-record";
import { write, type WriteInput } from "./write";

export function setClearance(
  db: Db,
  accountId: string,
  input: { transactionIds: string[]; status: TransactionInputStatus } & WriteInput,
): { updated: number } {
  const ids = [...new Set(input.transactionIds)];
  const rows = db.select().from(transactions).where(inArray(transactions.id, ids)).all();
  if (rows.length !== ids.length) {
    throw new ServiceError("transaction_not_found", 404);
  }
  for (const row of rows) {
    if (row.accountId !== accountId) {
      throw new ServiceError("transaction_not_found", 404);
    }
    if (transactionReconciled(db, row.accountId, row.date)) {
      throw new ServiceError("transaction_reconciled", 409);
    }
  }
  const changes = rows.filter((row) => row.status !== input.status);
  if (changes.length === 0) {
    return { updated: 0 };
  }
  const at = input.at ?? utcNow();
  write(db, { source: input.source, at }, (tx) => {
    for (const row of changes) {
      const before = readTransaction(tx, row.id);
      if (before.reconciled) {
        throw new ServiceError("transaction_reconciled", 409);
      }
      tx.update(transactions).set({ status: input.status, editedAt: at }).where(eq(transactions.id, row.id)).run();
      auditTransaction(tx, row.id, "update", before, readTransaction(tx, row.id));
    }
  });
  return { updated: changes.length };
}
