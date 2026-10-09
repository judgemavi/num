import { transactionLines, transactions } from "@num/db";
import {
  normalizePayee,
  rankRefundPurchases,
  refundLinkAllowed,
  refundWindowStart,
  type RefundPurchaseItem,
} from "@num/shared";
import { and, eq, gte, lt, lte } from "drizzle-orm";
import type { Db } from "../db";
import { whole } from "../whole";
import { ServiceError } from "../service-error";
import { auditTransaction, readTransaction, type Header } from "./transaction-record";
import type { WriteTx } from "./write";

export function assertRefundLink(tx: WriteTx, header: Header, selfId: string | null): void {
  if (header.refundOfId == null) {
    return;
  }
  if (selfId !== null && header.refundOfId === selfId) {
    throw new ServiceError("refund_link_invalid", 400);
  }
  const purchase = tx.select().from(transactions).where(eq(transactions.id, header.refundOfId)).get();
  if (!purchase || purchase.mirror) {
    throw new ServiceError("refund_link_invalid", 400);
  }
  const category = tx
    .select({ categoryId: transactionLines.categoryId })
    .from(transactionLines)
    .where(eq(transactionLines.transactionId, purchase.id))
    .all()
    .find((line) => line.categoryId !== null);
  if (!category?.categoryId) {
    throw new ServiceError("refund_link_invalid", 400);
  }
  if (
    !refundLinkAllowed({
      purchaseAmount: purchase.amount,
      purchaseDate: purchase.date,
      refundAmount: header.amount,
      refundDate: header.date,
    })
  ) {
    throw new ServiceError("refund_link_invalid", 400);
  }
}

export function clearRefundLinks(tx: WriteTx, purchaseId: string): void {
  const rows = tx
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.refundOfId, purchaseId)))
    .all();
  for (const row of rows) {
    const before = readTransaction(tx, row.id);
    tx.update(transactions).set({ refundOfId: null }).where(eq(transactions.id, row.id)).run();
    auditTransaction(tx, row.id, "update", before, readTransaction(tx, row.id));
  }
}

export function listRefundPurchases(
  db: Db,
  input: { asOf: string; payee?: string; merchantId?: string },
): RefundPurchaseItem[] {
  const start = refundWindowStart(input.asOf);
  const rows = db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      payeeRaw: transactions.payeeRaw,
      payeeNormalized: transactions.payeeNormalized,
      merchantId: transactions.merchantId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.mirror, false),
        lt(transactions.amount, 0),
        gte(transactions.date, start),
        lte(transactions.date, input.asOf),
      ),
    )
    .all();
  const withCategory = rows.flatMap((row) => {
    const line = db
      .select({ categoryId: transactionLines.categoryId })
      .from(transactionLines)
      .where(eq(transactionLines.transactionId, row.id))
      .all()
      .find((item) => item.categoryId !== null);
    if (!line?.categoryId) {
      return [];
    }
    return [{ ...row, categoryId: line.categoryId }];
  });
  const payee = normalizePayee(input.payee ?? "");
  return rankRefundPurchases(input.asOf, payee, input.merchantId ?? null, withCategory).flatMap((row) => {
    if (row.categoryId === null) {
      return [];
    }
    return [
      {
        id: row.id,
        date: row.date,
        amount: whole(row.amount),
        payeeRaw: row.payeeRaw,
        categoryId: row.categoryId,
      },
    ];
  });
}
