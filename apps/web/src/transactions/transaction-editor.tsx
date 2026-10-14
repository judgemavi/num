import type { Transaction } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { inboxDecisionsQuery } from "@/api/review";
import { transactionQuery, useDeleteTransaction, useSaveTransaction } from "@/api/transactions";
import { LoadError, LoadingLine } from "@/editors/load-state";
import { useAccounts, useBookCurrency, useCategories, useMerchants, useTags } from "@/editors/lookups";
import { decisionText } from "@/review/format";
import { GroupEditor } from "@/transactions/transaction-group";
import { TransactionForm } from "@/transactions/transaction-form";

type TransactionEditorProps = {
  id: string | null;
  rawLine?: string;
  initialAccountId?: string;
  unreadableItemKey?: string;
  groupIds?: string[];
  onClose: () => void;
  onSaved: (id: string) => void;
};

function amountLocked(transaction: Transaction, peer: Transaction | undefined): boolean {
  const line = transaction.lines[0];
  if (!peer || !line || transaction.lines.length !== 1) {
    return false;
  }
  return peer.lines.length > 1 && line.transferAccountId === peer.accountId;
}

export function TransactionEditor({ id, rawLine, initialAccountId, unreadableItemKey, groupIds, onClose, onSaved }: TransactionEditorProps) {
  if (groupIds && groupIds.length > 0) {
    return <GroupHost ids={groupIds} onSaved={onSaved} />;
  }
  return <SingleEditor id={id} rawLine={rawLine} initialAccountId={initialAccountId} unreadableItemKey={unreadableItemKey} onClose={onClose} onSaved={onSaved} />;
}

function GroupHost({ ids, onSaved }: { ids: string[]; onSaved: (id: string) => void }) {
  const currency = useBookCurrency();
  const accounts = useAccounts();
  const categories = useCategories();
  const merchants = useMerchants();
  if (!currency.data || !accounts.data || !categories.data || !merchants.data) {
    return <LoadingLine label="Loading the transactions." />;
  }
  return (
    <GroupEditor
      ids={ids}
      currency={currency.data}
      accounts={accounts.data}
      categories={categories.data}
      merchants={merchants.data}
      onSaved={onSaved}
    />
  );
}

function SingleEditor({ id, rawLine, initialAccountId, unreadableItemKey, onClose, onSaved }: TransactionEditorProps) {
  const currency = useBookCurrency();
  const accounts = useAccounts();
  const categories = useCategories();
  const tags = useTags();
  const merchants = useMerchants();
  const save = useSaveTransaction();
  const remove = useDeleteTransaction();
  // The editor stops its reads when a save or a delete starts. Thus the form stays on the screen until the editor
  // closes, and a deleted transaction is not read again.
  const live = (save.isIdle || save.isError) && (remove.isIdle || remove.isError);
  const decisions = useQuery(inboxDecisionsQuery(id !== null));
  const transaction = useQuery(transactionQuery(id, live));
  const peerId = transaction.data?.transferPeerId ?? null;
  const peer = useQuery(transactionQuery(peerId, live));

  const listsReady = currency.data && accounts.data && categories.data && tags.data && merchants.data;
  const loading = !listsReady || (id !== null && (transaction.isPending || (peerId !== null && peer.isPending)));
  const failed = (id !== null && transaction.isError) || currency.isError || accounts.isError || categories.isError || tags.isError || merchants.isError;

  if (loading) {
    return <LoadingLine label="Loading the transaction." />;
  }
  if (failed || !listsReady) {
    return (
      <LoadError
        label="The transaction did not load."
        onRetry={() => {
          void transaction.refetch();
          void currency.refetch();
        }}
      />
    );
  }

  const notes = (decisions.data ?? []).flatMap((row) => {
    if (!id) {
      return [];
    }
    const transfer = row.decision === "not_transfer" && row.itemKey.split(":").includes(id);
    const paycheck = row.decision === "keep_unassigned" && row.itemKey === `paycheck_funding:${id}`;
    const kept = row.decision === "keep_uncategorized" && row.itemKey === `uncategorized:${id}`;
    if (!transfer && !paycheck && !kept) {
      return [];
    }
    return [{ itemKey: row.itemKey, text: decisionText(row.decision) }];
  });

  return (
    <TransactionForm
      key={id ?? "new"}
      decisions={notes}
      currency={currency.data}
      transaction={id === null ? null : (transaction.data ?? null)}
      amountLocked={transaction.data ? amountLocked(transaction.data, peer.data) : false}
      accounts={accounts.data}
      categories={categories.data}
      tags={tags.data}
      merchants={merchants.data}
      rawLine={rawLine}
      initialAccountId={initialAccountId}
      unreadableItemKey={unreadableItemKey}
      onClose={onClose}
      onSaved={onSaved}
      deleteKind={transaction.data?.transferPeerId ? (peer.data?.mirror ? "mirror" : "linked") : "plain"}
      save={save}
      remove={remove}
    />
  );
}
