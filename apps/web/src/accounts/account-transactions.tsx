import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useDeferredValue, useState } from "react";
import { accountQuery } from "@/api/accounts";
import { transactionListQuery } from "@/api/transactions";
import { Boundary } from "@/components/boundary";
import { ListCard, ListEmpty } from "@/components/list-card";
import { localAsOf } from "@/as-of";
import { columnSort, lastPageOf, sortParams } from "@/lists/list-search";
import { ListPager } from "@/lists/list-pager";
import { TransactionsTable, type TransactionSort } from "@/transactions/transactions-table";

const accountRoute = getRouteApi("/accounts_/$accountId");

const defaultSort: TransactionSort = { sort: "date", dir: "desc" };

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
  const lastPage = lastPageOf(transactions.total, transactions.pageSize);

  function setPage(next: number) {
    void navigate({ search: (prev) => ({ ...prev, page: next }) });
  }

  function sortBy(column: TransactionSort["sort"]) {
    setSort(columnSort(sort, column, defaultSort));
    setPage(1);
  }

  return (
    <ListCard label="Transactions" title="Transactions">
      {rows.length === 0 ? (
        <ListEmpty>No transactions in this account.</ListEmpty>
      ) : (
        <TransactionsTable
          rows={rows}
          showBalance={account.kind !== "investment" && account.kind !== "property"}
          hideAccount
          sort={sort}
          onSort={sortBy}
        />
      )}
      <ListPager page={page} lastPage={lastPage} onPage={setPage} className="flex items-center justify-end gap-2 px-5 py-3" />
    </ListCard>
  );
}
