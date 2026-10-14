import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useDeferredValue, useState } from "react";
import { accountQuery } from "@/api/accounts";
import { useMarkClearance } from "@/api/checkpoints";
import { transactionListQuery } from "@/api/transactions";
import { Boundary } from "@/components/boundary";
import { ListCard } from "@/components/list-card";
import { Button } from "@/components/ui/button";
import { localAsOf } from "@/as-of";
import { columnSort, lastPageOf, sortParams } from "@/lists/list-search";
import { ListPager } from "@/lists/list-pager";
import { TransactionsTable, type TransactionSort } from "@/transactions/transactions-table";

const selectionLimit = 200;

const accountRoute = getRouteApi("/accounts_/$accountId");

const defaultSort: TransactionSort = { sort: "date", dir: "desc" };

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

/** The transactions of the account of the page. The page number is in the URL. The sort order is local. */
export function AccountTransactions() {
  return (
    <Boundary loading="Loading transactions." failed="The transactions did not load.">
      <AccountActivity />
    </Boundary>
  );
}

function AccountActivity() {
  const { accountId } = accountRoute.useParams();
  const { page } = accountRoute.useSearch();
  const navigate = accountRoute.useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const [capped, setCapped] = useState(false);
  const clearance = useMarkClearance();
  const pending = clearance.isPending;

  const [sort, setSort] = useState(defaultSort);
  // The page reads the account first, thus this read does not wait.
  const { data: account } = useSuspenseQuery(accountQuery(accountId));
  // The page on the screen stays while a new page or a new sort order loads.
  const shownPage = useDeferredValue(page);
  const shownSort = useDeferredValue(sort);
  const search = {
    page: shownPage,
    pageSize: 50,
    accountId,
    uncategorized: false,
    automatic: false,
    ...sortParams(shownSort, defaultSort),
  };

  const { data: transactions } = useSuspenseQuery(transactionListQuery(search, localAsOf()));

  const rows = transactions.items;
  const selectable = rows.filter((row) => !row.reconciled);
  const lastPage = lastPageOf(transactions.total, transactions.pageSize);

  function setPage(next: number) {
    void navigate({ search: (prev) => ({ ...prev, page: next }) });
  }

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

  function sortBy(column: TransactionSort["sort"]) {
    setSort(columnSort(sort, column, defaultSort));
    setPage(1);
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
      {rows.length === 0 ? (
        <p className="px-5 py-5 text-muted-foreground">No transactions in this account.</p>
      ) : (
        <TransactionsTable
          rows={rows}
          empty="No transactions in this account."
          showBalance={account.kind !== "investment" && account.kind !== "property"}
          hideAccount
          selection={{ ids: selected, onToggle: toggle, onTogglePage: togglePage }}
          sort={sort}
          onSort={sortBy}
        />
      )}
      {capped || selected.length >= selectionLimit ? (
        <p role="status" className="px-5 py-3 text-sm text-muted-foreground">
          You can mark 200 transactions at a time.
        </p>
      ) : null}
      <ListPager page={page} lastPage={lastPage} onPage={setPage} className="flex items-center justify-end gap-2 px-5 py-3" />
    </ListCard>
  );
}
