import { utcNow, type Transaction } from "@num/shared";
import type { Db } from "../db";
import { readTransaction } from "./transaction-record";
import { applyTransactionUpdate } from "./transactions";
import { write, type AuditSource } from "./write";

/** Answer "Refund of which purchase?": link the refund to the chosen purchase in one audited write. */
export function linkRefundToPurchase(
  db: Db,
  id: string,
  purchaseId: string,
  input: { source: AuditSource; at?: string },
): Transaction {
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
    const current = readTransaction(tx, id);
    return applyTransactionUpdate(
      tx,
      id,
      {
        accountId: current.accountId,
        date: current.date,
        amount: current.amount,
        payeeRaw: current.payeeRaw,
        merchantId: current.merchantId,
        lines: current.lines.map((line) => ({
          amount: line.amount,
          memo: line.memo,
          categoryId: line.categoryId,
          transferAccountId: line.transferAccountId,
          tagIds: line.tagIds,
        })),
        refundOfId: purchaseId,
      },
      at,
    );
  });
}
