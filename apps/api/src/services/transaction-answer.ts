import { transactions, type TransactionRow } from "@num/db";
import type { ReviewAnswer, Transaction, TransactionWrite } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { addOccurrenceLink } from "./recurring-links";
import { recordRefundNo } from "./refund-auto";
import { listTransferPairs } from "./suggestions";
import { recordPairNo } from "./transfer-auto";
import type { WriteTx } from "./write";

/** True when the transfer pair of the two transactions is still a proposal. A read before the write. */
export function pairIsOpen(db: Db, asOf: string, id: string, otherId: string): boolean {
  return listTransferPairs(db, asOf).items.some(
    (pair) => (pair.leftId === id && pair.rightId === otherId) || (pair.leftId === otherId && pair.rightId === id),
  );
}

/** The other row of the pair when the saved fields accept the pair: one transfer line to the account of that row. */
export function acceptedPeer(tx: WriteTx, body: TransactionWrite, otherId: string): TransactionRow | null {
  const other = tx.select().from(transactions).where(eq(transactions.id, otherId)).get();
  const [line, ...rest] = body.lines;
  if (!other || !line || rest.length > 0 || line.transferAccountId !== other.accountId) {
    return null;
  }
  return other;
}

/**
 * The answer that a save gives to a question that the editor showed. The pair that the save accepts
 * does not come here. A "no" is a decision that the app records, thus the question does not come back.
 */
export function recordSaveAnswer(tx: WriteTx, saved: Transaction, answer: ReviewAnswer, at: string): void {
  switch (answer.question) {
    case "transfer_pair":
      recordPairNo(tx, saved.id, answer.otherId, at);
      return;
    case "refund_purchase":
      if (saved.refundOfId === null) {
        recordRefundNo(tx, saved.id, at);
      }
      return;
    case "recurring_ambiguous":
      addOccurrenceLink(tx, answer.bucketId, answer.dueDate, saved.id, at, false);
      return;
  }
}
