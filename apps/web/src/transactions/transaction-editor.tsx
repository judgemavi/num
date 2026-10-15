import type { Transaction } from "@num/shared";
import { usePrefetchQuery, useSuspenseQueries } from "@tanstack/react-query";
import { useDeferredValue } from "react";
import { inboxDecisionsQuery } from "@/api/review";
import { transactionQuery, transactionReviewQuery } from "@/api/transactions";
import { localAsOf } from "@/as-of";
import type { EditorInput } from "@/editors/editor-types";
import { TransactionForm } from "@/transactions/transaction-form";

function amountLocked(transaction: Transaction, peer: Transaction | undefined) {
  const line = transaction.lines[0];
  if (!peer || !line || transaction.lines.length !== 1) {
    return false;
  }
  return peer.lines.length > 1 && line.transferAccountId === peer.accountId;
}

export function TransactionEditor({ id, ...create }: EditorInput["transaction"]) {
  if (id === null) {
    return <TransactionForm {...create} transaction={null} amountLocked={false} />;
  }
  return <SavedTransaction id={id} />;
}

function SavedTransaction({ id }: { id: string }) {
  // The form shows the Needs review answers of the transaction. Their read starts here, with the read of the transaction.
  usePrefetchQuery(inboxDecisionsQuery());
  // The Needs review question of the transaction gives the start values of its fields.
  const [{ data: transaction }, { data: review }] = useSuspenseQueries({ queries: [transactionQuery(id), transactionReviewQuery(id, localAsOf())] });
  // A read in the background can make the transaction a transfer. The other side then loads in a transition, thus
  // the form stays on the screen. The list of ids is empty for a transaction that is not a transfer.
  const peerId = useDeferredValue(transaction.transferPeerId);
  const peerIds = peerId ? [peerId] : [];
  const peer = useSuspenseQueries({ queries: peerIds.map((peer) => transactionQuery(peer)) }).at(0)?.data;

  return (
    <TransactionForm
      transaction={transaction}
      review={review}
      amountLocked={amountLocked(transaction, peer)}
      deleteKind={transaction.transferPeerId ? (peer?.mirror ? "mirror" : "linked") : "plain"}
    />
  );
}
