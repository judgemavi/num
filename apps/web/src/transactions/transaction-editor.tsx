import { inboxDecisionListSchema, transactionSchema, type Transaction } from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoadError, LoadingLine } from "@/editors/load-state";
import { useAccounts, useBookCurrency, useCategories, useMerchants, useTags } from "@/editors/lookups";
import { apiRequest } from "@/request";
import { undoDecision } from "@/inbox/actions";
import { decisionText } from "@/inbox/format";
import { transactionError } from "@/transactions/format";
import { GroupEditor } from "@/transactions/transaction-group";
import { TransactionForm } from "@/transactions/transaction-form";

type TransactionEditorProps = {
  id: string | null;
  rawLine?: string;
  initialAccountId?: string;
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

export function TransactionEditor({ id, rawLine, initialAccountId, groupIds, onClose, onSaved }: TransactionEditorProps) {
  if (groupIds && groupIds.length > 0) {
    return <GroupHost ids={groupIds} onClose={onClose} onSaved={onSaved} />;
  }
  return <SingleEditor id={id} rawLine={rawLine} initialAccountId={initialAccountId} onClose={onClose} onSaved={onSaved} />;
}

function GroupHost({ ids, onClose, onSaved }: { ids: string[]; onClose: () => void; onSaved: (id: string) => void }) {
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
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function SingleEditor({ id, rawLine, initialAccountId, onClose, onSaved }: TransactionEditorProps) {
  const queryClient = useQueryClient();
  const currency = useBookCurrency();
  const accounts = useAccounts();
  const categories = useCategories();
  const tags = useTags();
  const merchants = useMerchants();
  const decisions = useQuery({
    queryKey: ["inbox-decisions"],
    enabled: id !== null,
    queryFn: async () => {
      const result = await apiRequest("/api/inbox/decisions", inboxDecisionListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.items;
    },
  });
  const transaction = useQuery({
    queryKey: ["transaction", id],
    enabled: id !== null,
    queryFn: async () => {
      const result = await apiRequest(`/api/transactions/${id}`, transactionSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });
  const peerId = transaction.data?.transferPeerId ?? null;
  const peer = useQuery({
    queryKey: ["transaction", peerId],
    enabled: peerId !== null,
    queryFn: async () => {
      const result = await apiRequest(`/api/transactions/${peerId}`, transactionSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });

  const listsReady = currency.data && accounts.data && categories.data && tags.data && merchants.data;
  const loading = !listsReady || (id !== null && (transaction.isPending || (peerId !== null && peer.isPending)));
  const failed = (id !== null && transaction.isError) || currency.isError || accounts.isError || categories.isError || tags.isError || merchants.isError;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    await queryClient.invalidateQueries({ queryKey: ["transaction"] });
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    await queryClient.invalidateQueries({ queryKey: ["account"] });
    await queryClient.invalidateQueries({ queryKey: ["inbox"] });
    await queryClient.invalidateQueries({ queryKey: ["inbox-decisions"] });
    await queryClient.invalidateQueries({ queryKey: ["import-detail"] });
  }

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
    if (!transfer && !paycheck) {
      return [];
    }
    return [{ itemKey: row.itemKey, text: decisionText(row.decision) }];
  });

  return (
    <TransactionForm
      key={id ?? "new"}
      decisions={notes}
      onUndoDecision={(itemKey) => {
        void undoDecision(itemKey).then(async (result) => {
          if (result.ok) {
            await queryClient.invalidateQueries({ queryKey: ["inbox-decisions"] });
            await queryClient.invalidateQueries({ queryKey: ["inbox"] });
          }
        });
      }}
      currency={currency.data}
      transaction={id === null ? null : (transaction.data ?? null)}
      amountLocked={transaction.data ? amountLocked(transaction.data, peer.data) : false}
      accounts={accounts.data}
      categories={categories.data}
      tags={tags.data}
      merchants={merchants.data}
      rawLine={rawLine}
      initialAccountId={initialAccountId}
      onClose={onClose}
      onSaved={(savedId) => {
        void refresh();
        onSaved(savedId);
      }}
      deleteKind={transaction.data?.transferPeerId ? (peer.data?.mirror ? "mirror" : "linked") : "plain"}
      onDelete={async () => {
        if (!transaction.data) {
          return null;
        }
        const result = await apiRequest(`/api/transactions/${transaction.data.id}`, transactionSchema, { method: "DELETE" });
        if (!result.ok) {
          return transactionError(result.code);
        }
        await refresh();
        onClose();
        return null;
      }}
    />
  );
}
