import { transactionSchema, type Transaction } from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LoadError, LoadingLine } from "@/editors/load-state";
import { useAccounts, useBookCurrency, useCategories, useMerchants, useTags } from "@/editors/lookups";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/request";
import { transactionError } from "@/transactions/format";
import { GroupEditor } from "@/transactions/transaction-group";
import { TransactionForm } from "@/transactions/transaction-form";

type TransactionEditorProps = {
  id: string | null;
  rawLine?: string;
  initialAccountId?: string;
  groupIds?: string[];
  queueIds?: string[];
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

export function TransactionEditor({ id, rawLine, initialAccountId, groupIds, queueIds, onClose, onSaved }: TransactionEditorProps) {
  if (groupIds && groupIds.length > 0) {
    return <GroupHost ids={groupIds} onClose={onClose} onSaved={onSaved} />;
  }
  if (queueIds && queueIds.length > 0) {
    return <QueueEditor ids={queueIds} onClose={onClose} onSaved={onSaved} />;
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

function QueueEditor({ ids, onClose, onSaved }: { ids: string[]; onClose: () => void; onSaved: (id: string) => void }) {
  const [index, setIndex] = useState(0);
  const current = ids[index] ?? ids[0] ?? null;
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {index + 1} of {ids.length}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}>
            Previous
          </Button>
          <Button type="button" variant="outline" disabled={index >= ids.length - 1} onClick={() => setIndex((value) => Math.min(ids.length - 1, value + 1))}>
            Next
          </Button>
        </div>
      </div>
      <SingleEditor
        key={current ?? "queue"}
        id={current}
        onClose={onClose}
        onSaved={(savedId) => {
          if (index >= ids.length - 1) {
            onSaved(savedId);
            return;
          }
          setIndex((value) => value + 1);
        }}
      />
    </div>
  );
}

function SingleEditor({ id, rawLine, initialAccountId, onClose, onSaved }: TransactionEditorProps) {
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
