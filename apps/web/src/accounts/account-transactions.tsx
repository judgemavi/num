import { clearanceResultSchema, transactionListSchema, type TransactionListItem } from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Amount } from "@/components/amount";
import { ListCard, ListRow } from "@/components/list-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/request";
import { formatDate, statusLabel } from "@/transactions/format";
import { transactionPath } from "@/transactions/query";

const selectionLimit = 200;

type AccountTransactionsProps = {
  accountId: string;
  currency: string;
  page: number;
  onPage: (page: number) => void;
};

function withLimit(current: string[], ids: string[], on: boolean): { next: string[]; capped: boolean } {
  if (!on) {
    const drop = new Set(ids);
    return { next: current.filter((id) => !drop.has(id)), capped: false };
  }
  const next = [...current];
  let capped = false;
  for (const id of ids) {
    if (next.includes(id)) {
      continue;
    }
    if (next.length >= selectionLimit) {
      capped = true;
      break;
    }
    next.push(id);
  }
  return { next, capped };
}

export function AccountTransactions({ accountId, currency, page, onPage }: AccountTransactionsProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [capped, setCapped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const transactions = useQuery({
    queryKey: ["transactions", accountId, page],
    queryFn: async () => {
      const result = await apiRequest(
        transactionPath({ page, pageSize: 50, accountId, uncategorized: false }),
        transactionListSchema,
      );
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });

  const rows = transactions.data?.items ?? [];
  const selectable = rows.filter((row) => row.status !== "reconciled");
  const selectedOnPage = selectable.filter((row) => selected.includes(row.id));
  const lastPage = transactions.data ? Math.max(1, Math.ceil(transactions.data.total / transactions.data.pageSize)) : 1;

  function applySelection(ids: string[], on: boolean) {
    const result = withLimit(selected, ids, on);
    setCapped(result.capped);
    setSelected(result.next);
  }

  function toggle(id: string, on: boolean) {
    applySelection([id], on);
  }

  function togglePage(on: boolean) {
    applySelection(
      selectable.map((row) => row.id),
      on,
    );
  }

  async function mark(status: "open" | "cleared") {
    if (selected.length === 0) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await apiRequest(`/api/accounts/${accountId}/clearance`, clearanceResultSchema, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactionIds: selected, status }),
      });
      if (!result.ok) {
        setError(
          result.code === "transaction_reconciled"
            ? "Unlock the checkpoint before you change a reconciled transaction."
            : "The transactions did not update. Try again.",
        );
        return;
      }
      setSelected([]);
      setCapped(false);
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["reconcile", accountId] });
    } catch {
      setError("The transactions did not update. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <ListCard
      label="Transactions"
      title="Transactions"
      actions={
        <>
          <Button type="button" variant="outline" disabled={pending || selected.length === 0} onClick={() => void mark("cleared")}>
            Mark cleared
          </Button>
          <Button type="button" variant="outline" disabled={pending || selected.length === 0} onClick={() => void mark("open")}>
            Mark open
          </Button>
        </>
      }
    >
      {transactions.isPending ? <p className="px-5 py-5 text-muted-foreground">Loading transactions.</p> : null}
      {transactions.isError ? <p className="px-5 py-5">The transactions did not load.</p> : null}
      {transactions.data && rows.length === 0 ? (
        <p className="px-5 py-5 text-muted-foreground">No transactions in this account.</p>
      ) : null}
      {selectable.length > 0 ? (
        <div className="flex min-h-11 items-center gap-3 border-b px-5">
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
            <Checkbox
              checked={
                selectedOnPage.length === 0 ? false : selectedOnPage.length === selectable.length ? true : "indeterminate"
              }
              onCheckedChange={(value) => togglePage(value === true)}
              aria-label="Select transactions on this page"
            />
            Select transactions on this page
          </label>
        </div>
      ) : null}
      {rows.map((row) => (
        <TransactionLine
          key={row.id}
          row={row}
          currency={currency}
          checked={selected.includes(row.id)}
          onChecked={(on) => toggle(row.id, on)}
        />
      ))}
      {capped || selected.length >= selectionLimit ? (
        <p role="status" className="px-5 py-3 text-sm text-muted-foreground">
          You can mark 200 transactions at a time.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="px-5 py-3 text-sm text-attn">
          {error}
        </p>
      ) : null}
      {transactions.data && transactions.data.total > transactions.data.pageSize ? (
        <div className="flex items-center justify-end gap-2 px-5 py-3">
          <Button type="button" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            Previous
          </Button>
          <Button type="button" variant="outline" disabled={page >= lastPage} onClick={() => onPage(page + 1)}>
            Next
          </Button>
        </div>
      ) : null}
    </ListCard>
  );
}

function TransactionLine({
  row,
  currency,
  checked,
  onChecked,
}: {
  row: TransactionListItem;
  currency: string;
  checked: boolean;
  onChecked: (on: boolean) => void;
}) {
  const locked = row.status === "reconciled";
  return (
    <ListRow simple>
      {locked ? (
        <span className="size-11 shrink-0" />
      ) : (
        <label className="flex size-11 shrink-0 items-center justify-center">
          <Checkbox checked={checked} onCheckedChange={(value) => onChecked(value === true)} aria-label={`Select ${row.payeeRaw}`} />
        </label>
      )}
      <div className="list-name min-w-0 flex-1 font-semibold [&_small]:block [&_small]:text-[13px] [&_small]:font-normal [&_small]:text-muted-foreground">
        {row.payeeRaw}
        <small>{formatDate(row.date)}</small>
      </div>
      {row.status === "open" ? null : <Badge variant={row.status === "reconciled" ? "neutral" : "positive"}>{statusLabel(row.status)}</Badge>}
      <div className="ml-auto text-right">
        <Amount currency={currency} minor={row.amount} />
      </div>
    </ListRow>
  );
}
