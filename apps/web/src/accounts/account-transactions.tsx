import { clearanceResultSchema, transactionListSchema, type TransactionListQuery } from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ListCard } from "@/components/list-card";
import { Button } from "@/components/ui/button";
import { useAccounts, useCategories, useMerchants } from "@/editors/lookups";
import { apiRequest } from "@/request";
import { localAsOf } from "@/as-of";
import { transactionPath } from "@/transactions/query";
import { TransactionsTable } from "@/transactions/transactions-table";

const selectionLimit = 200;

type SortColumn = NonNullable<TransactionListQuery["sort"]>;

type AccountTransactionsProps = {
  accountId: string;
  currency: string;
  showBalance: boolean;
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

export function AccountTransactions({ accountId, currency, showBalance, page, onPage }: AccountTransactionsProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [capped, setCapped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [sort, setSort] = useState<SortColumn>("date");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const accounts = useAccounts();
  const categories = useCategories();
  const merchants = useMerchants();
  const search: TransactionListQuery = {
    page,
    pageSize: 50,
    accountId,
    uncategorized: false,
    automatic: false,
    needsReview: false,
    ...(sort === "date" && dir === "desc" ? {} : { sort, dir }),
  };

  const transactions = useQuery({
    queryKey: ["transactions", accountId, page, sort, dir],
    queryFn: async () => {
      const result = await apiRequest(transactionPath(search, localAsOf()), transactionListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });

  const rows = transactions.data?.items ?? [];
  const selectable = rows.filter((row) => !row.reconciled);
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

  function sortBy(column: SortColumn) {
    setDir(sort === column ? (dir === "asc" ? "desc" : "asc") : column === "date" ? "desc" : "asc");
    setSort(column);
    onPage(1);
  }

  function sortState(column: SortColumn): "ascending" | "descending" | "none" {
    if (sort !== column) {
      return "none";
    }
    return dir === "asc" ? "ascending" : "descending";
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
      await queryClient.invalidateQueries({ queryKey: ["needs-review"] });
      await queryClient.invalidateQueries({ queryKey: ["hygiene"] });
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
      {transactions.data && accounts.data && categories.data && merchants.data && rows.length > 0 ? (
        <TransactionsTable
          search={search}
          rows={rows}
          counts={null}
          currency={currency}
          accounts={accounts.data}
          categories={categories.data}
          merchants={merchants.data}
          showBalance={showBalance}
          hideAccount
          selection={{ ids: selected, onToggle: toggle, onTogglePage: togglePage }}
          sortState={sortState}
          onSort={sortBy}
        />
      ) : null}
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
