import type { Transaction } from "@num/shared";
import { usePrefetchQuery, useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import { useDeferredValue } from "react";
import { inboxDecisionsQuery } from "@/api/review";
import { transactionQuery } from "@/api/transactions";
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
  const { data: transaction } = useSuspenseQuery(transactionQuery(id));
  // A read in the background can make the transaction a transfer. The other side then loads in a transition, thus
  // the form stays on the screen. The list of ids is empty for a transaction that is not a transfer.
  const peerId = useDeferredValue(transaction.transferPeerId);
  const peerIds = peerId ? [peerId] : [];
  const peer = useSuspenseQueries({ queries: peerIds.map((peer) => transactionQuery(peer)) }).at(0)?.data;

  return (
    <TransactionForm
      transaction={transaction}
      amountLocked={amountLocked(transaction, peer)}
      deleteKind={transaction.transferPeerId ? (peer?.mirror ? "mirror" : "linked") : "plain"}
    />
  );
}
