import { merchants, schedules, transactions } from "@num/db";
import { utcNow, type Merchant } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { getMerchant } from "./merchants";
import { auditTransaction, readTransaction } from "./transaction-record";
import { withoutId, write, type WriteTx, type WriteInput } from "./write";

function moveTransactions(tx: WriteTx, sourceId: string, targetId: string, at: string) {
  const rows = tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.merchantId, sourceId)).all();
  for (const row of rows) {
    const before = readTransaction(tx, row.id);
    tx.update(transactions).set({ merchantId: targetId, editedAt: at }).where(eq(transactions.id, row.id)).run();
    auditTransaction(tx, row.id, "update", before, readTransaction(tx, row.id));
  }
}

function moveSchedules(tx: WriteTx, sourceId: string, targetId: string) {
  const rows = tx.select().from(schedules).where(eq(schedules.merchantId, sourceId)).all();
  for (const { bucketId, ...row } of rows) {
    tx.update(schedules).set({ merchantId: targetId }).where(eq(schedules.bucketId, bucketId)).run();
    tx.audit({
      entity: "schedules",
      entityId: bucketId,
      action: "update",
      before: row,
      after: { ...row, merchantId: targetId },
    });
  }
}

export function mergeMerchants(db: Db, sourceId: string, targetId: string, input: WriteInput): Merchant {
  if (sourceId === targetId) {
    throw new ServiceError("merchant_merge_same", 400);
  }
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
    const source = getMerchant(tx, sourceId);
    const target = getMerchant(tx, targetId);
    if (target.archivedAt) {
      throw new ServiceError("merchant_archived", 409);
    }
    moveTransactions(tx, sourceId, targetId, at);
    moveSchedules(tx, sourceId, targetId);
    const next = { ...source, archivedAt: source.archivedAt ?? at };
    if (!source.archivedAt) {
      tx.update(merchants).set({ archivedAt: at }).where(eq(merchants.id, sourceId)).run();
    }
    tx.audit({
      entity: "merchants",
      entityId: sourceId,
      action: "merge",
      before: withoutId(source),
      after: { ...withoutId(next), mergedInto: targetId },
    });
    return target;
  });
}
