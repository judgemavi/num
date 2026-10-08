import { transactionSchema, type Transaction } from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoadError, LoadingLine } from "@/editors/load-state";
import { useAccounts, useBookCurrency, useCategories, useMerchants, useTags } from "@/editors/lookups";
import { apiRequest } from "@/request";
import { transactionError } from "@/transactions/format";
import { TransactionForm } from "@/transactions/transaction-form";

type TransactionEditorProps = {
  id: string | null;
  rawLine?: string;
  initialAccountId?: string;
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

export function TransactionEditor({ id, rawLine, initialAccountId, onClose, onSaved }: TransactionEditorProps) {
  const queryClient = useQueryClient();
  const currency = useBookCurrency();
  const accounts = useAccounts();
  const categories = useCategories();
  const tags = useTags();
  const merchants = useMerchants();
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

  return (
    <TransactionForm
      key={id ?? "new"}
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
