import { transactionSchema, type Account, type Category, type Merchant, type Tag, type Transaction } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/request";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TransactionForm } from "@/transactions/transaction-form";

type TransactionDialogProps = {
  draft: string | "new";
  currency: string;
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  merchants: Merchant[];
  rawLine?: string;
  initialAccountId?: string;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (transaction: Transaction) => void;
};

function amountLocked(transaction: Transaction, peer: Transaction | undefined): boolean {
  const line = transaction.lines[0];
  if (!peer || !line || transaction.lines.length !== 1) {
    return false;
  }
  return peer.lines.length > 1 && line.transferAccountId === peer.accountId;
}

export function TransactionDialog({
  draft,
  currency,
  accounts,
  categories,
  tags,
  merchants,
  rawLine,
  initialAccountId,
  onClose,
  onSaved,
  onDelete,
}: TransactionDialogProps) {
  const transaction = useQuery({
    queryKey: ["transaction", draft],
    enabled: draft !== "new",
    queryFn: async () => {
      const result = await apiRequest(`/api/transactions/${draft}`, transactionSchema);
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

  const loading = draft !== "new" && (transaction.isPending || (peerId !== null && peer.isPending));
  const failed = draft !== "new" && transaction.isError;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[min(40rem,calc(100%-2rem))] overflow-y-auto">
        {loading ? <p className="text-muted-foreground">Loading the transaction.</p> : null}
        {failed ? (
          <div className="flex flex-col items-start gap-4">
            <p>The transaction did not load.</p>
            <Button type="button" onClick={() => void transaction.refetch()}>
              Try again
            </Button>
          </div>
        ) : null}
        {!loading && !failed ? (
          <TransactionForm
            key={draft === "new" ? "new" : draft}
            currency={currency}
            transaction={draft === "new" ? null : (transaction.data ?? null)}
            amountLocked={transaction.data ? amountLocked(transaction.data, peer.data) : false}
            accounts={accounts}
            categories={categories}
            tags={tags}
            merchants={merchants}
            rawLine={rawLine}
            initialAccountId={initialAccountId}
            onClose={onClose}
            onSaved={onSaved}
            deleteKind={
              transaction.data?.transferPeerId
                ? peer.data?.mirror
                  ? "mirror"
                  : "linked"
                : "plain"
            }
            onDelete={() => {
              if (transaction.data) {
                onDelete(transaction.data);
              }
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
