import type { TransactionListQuery } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useMarkClearance } from "@/api/checkpoints";
import { errorCode } from "@/api/client";
import { transactionListQuery } from "@/api/transactions";
import { ListCard } from "@/components/list-card";
import { Button } from "@/components/ui/button";
import { useAccounts, useCategories, useMerchants } from "@/editors/lookups";
import { localAsOf } from "@/as-of";
import { TransactionsTable } from "@/transactions/transactions-table";
import { useReviewActions } from "@/transactions/use-review-actions";

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
  const [selected, setSelected] = useState<string[]>([]);
  const [capped, setCapped] = useState(false);
  const clearance = useMarkClearance();
  const pending = clearance.isPending;

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

  const transactions = useQuery(transactionListQuery(search, localAsOf()));
  const actions = useReviewActions(search);

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

  function mark(status: "open" | "cleared") {
    if (selected.length === 0) {
      return;
    }
    clearance.mutate(
      { accountId, body: { transactionIds: selected, status } },
      {
        onSuccess: () => {
          setSelected([]);
          setCapped(false);
        },
      },
    );
  }

  const error = !clearance.error
    ? null
    : errorCode(clearance.error) === "transaction_reconciled"
      ? "Unlock the checkpoint before you change a reconciled transaction."
      : "The transactions did not update. Try again.";

  return (
    <ListCard
      label="Transactions"
      title="Transactions"
      actions={
        <>
          <Button type="button" variant="outline" disabled={pending || selected.length === 0} onClick={() => mark("cleared")}>
            Mark cleared
          </Button>
          <Button type="button" variant="outline" disabled={pending || selected.length === 0} onClick={() => mark("open")}>
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
          actions={actions}
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
