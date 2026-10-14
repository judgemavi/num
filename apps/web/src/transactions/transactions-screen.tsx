import { usePrefetchQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { localAsOf } from "@/as-of";
import { transactionListQuery } from "@/api/transactions";
import { Boundary } from "@/components/boundary";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { ListPager } from "@/lists/list-pager";
import { useLastPage } from "@/lists/use-list-search";
import { TransactionFilterBar } from "@/transactions/filters";
import { TransactionsTable } from "@/transactions/transactions-table";
import { useTransactionPage, useTransactionSearch } from "@/transactions/use-transaction-list";
import { useEditors } from "@/editors/editor-api";
import { useAccounts } from "@/editors/lookups";

/** The screen puts the parts in their places. Each part reads its own data. The filter bar shows new filters at once. */
export function TransactionsScreen() {
  // The list does not need the lists of the filter bar. Its read starts here, thus it does not wait for them.
  usePrefetchQuery(transactionListQuery(useTransactionSearch().shown, localAsOf()));

  return (
    <Boundary loading="Loading transactions." failed="The transactions did not load.">
      <TransactionsHeader />
      <TransactionFilterBar />
      <TransactionList />
      <Pager />
    </Boundary>
  );
}

function TransactionsHeader() {
  const { openEditor } = useEditors();
  const accounts = useAccounts();
  const { search, patch, page } = useTransactionPage();
  return (
    <PageHeader
      kicker={page.total === 1 ? "1 transaction" : `${page.total} transactions`}
      title="Transactions"
      actions={
        <>
          <Button type="button" variant={search.needsReview ? "default" : "secondary"} onClick={() => patch({ needsReview: !search.needsReview })}>
            Needs review
          </Button>
          <Button type="button" disabled={accounts.every((account) => account.archivedAt)} onClick={() => void openEditor("transaction", { id: null })}>
            <Plus size={20} strokeWidth={1.8} aria-hidden="true" />
            New transaction
          </Button>
        </>
      }
    />
  );
}

/** The table of the page. The column headers change the sort order in the URL. */
function TransactionList() {
  const accounts = useAccounts();
  const { shown, sort, sortBy, page } = useTransactionPage();
  const selectedAccount = accounts.find((account) => account.id === shown.accountId);

  return (
    <TransactionsTable
      search={shown}
      rows={page.items}
      counts={page.reviewCounts}
      showBalance={selectedAccount !== undefined && selectedAccount.kind !== "investment" && selectedAccount.kind !== "property"}
      sort={sort}
      onSort={sortBy}
    />
  );
}

/** The Previous and Next buttons. A page number after the last page goes to the last page. */
function Pager() {
  const list = useTransactionPage();
  const lastPage = useLastPage(list, list.page);
  return <ListPager page={list.search.page} lastPage={lastPage} onPage={list.setPage} />;
}
