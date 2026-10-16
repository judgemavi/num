import { transactionListQuerySchema } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { accountQuery } from "@/api/accounts";
import { transactionListQuery } from "@/api/transactions";
import { Boundary } from "@/components/boundary";
import { ListCard, ListEmpty } from "@/components/list-card";
import { localAsOf } from "@/as-of";
import { useLastPage } from "@/lists/use-list-search";
import { useAccountActivitySearch } from "@/accounts/use-account-activity";
import { ListPager } from "@/lists/list-pager";
import { TransactionsTable } from "@/transactions/transactions-table";

const accountRoute = getRouteApi("/accounts_/$accountId");

/** The transactions of the account of the page. The page and sort order are in the URL. */
export function AccountTransactions() {
  return (
    <Boundary loading="Loading transactions." failed="The transactions did not load.">
      <AccountActivity />
    </Boundary>
  );
}

function AccountActivity() {
  const { accountId } = accountRoute.useParams();
  const list = useAccountActivitySearch();
  const { data: account } = useSuspenseQuery(accountQuery(accountId));
  const search = transactionListQuerySchema.parse({ ...list.shown, accountId });

  const { data: transactions } = useSuspenseQuery(transactionListQuery(search, localAsOf()));

  const rows = transactions.items;
  const lastPage = useLastPage(list, transactions);

  return (
    <ListCard label="Transactions" title="Transactions">
      {rows.length === 0 ? (
        <ListEmpty>No transactions in this account.</ListEmpty>
      ) : (
        <TransactionsTable
          rows={rows}
          showBalance={!account.hasValuation}
          hideAccount
        />
      )}
      <ListPager page={list.search.page} lastPage={lastPage} onPage={list.setPage} className="flex items-center justify-end gap-2 px-5 py-3" />
    </ListCard>
  );
}
