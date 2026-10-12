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
import { ServiceError } from "../service-error";
import type { NormalizedLine } from "./transaction-rules";
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

/** A linked refund takes the category and the merchant of its purchase. The client values do not count. */
export function withRefundPurchase(
  tx: WriteTx,
  header: Header,
  lines: NormalizedLine[],
): { header: Header; lines: NormalizedLine[] } {
  if (header.refundOfId == null || lines.length !== 1 || lines[0]?.transferAccountId !== null) {
    return { header, lines };
  }
  const purchase = tx.select().from(transactions).where(eq(transactions.id, header.refundOfId)).get();
  const category = tx
    .select({ categoryId: transactionLines.categoryId })
    .from(transactionLines)
    .where(eq(transactionLines.transactionId, header.refundOfId))
    .all()
    .find((line) => line.categoryId !== null);
  if (!purchase || !category?.categoryId) {
    throw new ServiceError("refund_link_invalid", 400);
  }
  return {
    header: { ...header, merchantId: purchase.merchantId },
    lines: lines.map((line) => ({ ...line, categoryId: category.categoryId })),
  };
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
  input: { asOf: string; payee?: string },
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
  return rankRefundPurchases(input.asOf, payee, withCategory).flatMap((row) => {
    if (row.categoryId === null) {
      return [];
    }
    return [
      {
        id: row.id,
        date: row.date,
        amount: row.amount,
        payeeRaw: row.payeeRaw,
        categoryId: row.categoryId,
        merchantId: row.merchantId,
      },
    ];
  });
}
