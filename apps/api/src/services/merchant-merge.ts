import { merchants, recurringPlans, transactions } from "@num/db";
import { utcNow, type Merchant } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { toMerchant } from "./merchants";
import { auditTransaction, readTransaction } from "./transaction-record";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

function merchantSnapshot(row: { name: string; defaultCategoryId: string | null; archivedAt: string | null }) {
  return { name: row.name, defaultCategoryId: row.defaultCategoryId, archivedAt: row.archivedAt };
}

function moveTransactions(tx: WriteTx, sourceId: string, targetId: string) {
  const rows = tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.merchantId, sourceId)).all();
  for (const row of rows) {
    const before = readTransaction(tx, row.id);
    tx.update(transactions).set({ merchantId: targetId }).where(eq(transactions.id, row.id)).run();
    auditTransaction(tx, row.id, "update", before, readTransaction(tx, row.id));
  }
}

function movePlans(tx: WriteTx, sourceId: string, targetId: string) {
  const rows = tx.select().from(recurringPlans).where(eq(recurringPlans.merchantId, sourceId)).all();
  for (const row of rows) {
    tx.update(recurringPlans).set({ merchantId: targetId }).where(eq(recurringPlans.id, row.id)).run();
    tx.audit({
      entity: "recurring_plans",
      entityId: row.id,
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
  let merged: Merchant | undefined;
  write(db, { source: input.source, at }, (tx) => {
    const source = tx.select().from(merchants).where(eq(merchants.id, sourceId)).get();
    const target = tx.select().from(merchants).where(eq(merchants.id, targetId)).get();
    if (!source || !target) {
      throw new ServiceError("merchant_not_found", 404);
    }
    if (target.archivedAt) {
      throw new ServiceError("merchant_archived", 409);
    }
    moveTransactions(tx, sourceId, targetId);
    movePlans(tx, sourceId, targetId);
    const next = { ...source, archivedAt: source.archivedAt ?? at };
    if (!source.archivedAt) {
      tx.update(merchants).set({ archivedAt: at }).where(eq(merchants.id, sourceId)).run();
    }
    tx.audit({
      entity: "merchants",
      entityId: sourceId,
      action: "merge",
      before: merchantSnapshot(source),
      after: { ...merchantSnapshot(next), mergedInto: targetId },
    });
    merged = toMerchant(target);
  });
  if (!merged) {
    throw new Error("Merge did not return a merchant");
  }
  return merged;
}
