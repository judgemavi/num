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
import { hasFilters } from "@/transactions/query";
import { TransactionTabs } from "@/transactions/transaction-tabs";
import { TransactionsTable } from "@/transactions/transactions-table";
import { ApproveAll } from "@/transactions/approve-all";
import { useOnReview, useTransactionPage, useTransactionSearch } from "@/transactions/use-transaction-list";
import { useEditors } from "@/editors/editor-api";
import { useAccounts } from "@/editors/lookups";

/**
 * The screen of `/transactions` and of `/transactions/review` (decision 0047). The two pages show the same table.
 * The screen puts the parts in their places. Each part reads its own data. The filter bar shows new filters at once.
 * The rows and the count load in their own boundaries. Thus a read of the rows never removes the filter bar, and the
 * search box keeps the focus while the rows load.
 */
export function TransactionsScreen() {
  // The list does not need the lists of the filter bar. Its read starts here, thus it does not wait for them.
  usePrefetchQuery(transactionListQuery(useTransactionSearch().shown, localAsOf(), useOnReview()));

  return (
    <Boundary loading="Loading transactions." failed="The transactions did not load.">
      <TransactionsHeader />
      <TransactionFilterBar />
      <Boundary loading="Loading transactions." failed="The transactions did not load.">
        <TransactionList />
        <Pager />
      </Boundary>
    </Boundary>
  );
}

/** The number of transactions for the filters. */
function TransactionCount() {
  const { page } = useTransactionPage();
  return page.total === 1 ? "1 transaction" : `${page.total} transactions`;
}

function NewTransaction() {
  const { openEditor } = useEditors();
  const accounts = useAccounts();
  return (
    <Button type="button" disabled={accounts.every((account) => account.archivedAt)} onClick={() => void openEditor("transaction", { id: null })}>
      <Plus size={20} strokeWidth={1.8} aria-hidden="true" />
      New transaction
    </Button>
  );
}

function TransactionsHeader() {
  const review = useOnReview();
  return (
    <PageHeader
      kicker={
        <Boundary loading={null} failed={() => null}>
          <TransactionCount />
        </Boundary>
      }
      title="Transactions"
      actions={
        review ? (
          <Boundary loading={null} failed={() => null}>
            <ApproveAll />
          </Boundary>
        ) : (
          <NewTransaction />
        )
      }
      tabs={<TransactionTabs />}
    />
  );
}

/** The table of the page. The column headers change the sort order in the URL. */
function TransactionList() {
  const accounts = useAccounts();
  const review = useOnReview();
  const { shown, sort, sortBy, page } = useTransactionPage();
  const selectedAccount = accounts.find((account) => account.id === shown.accountId);
  const empty = hasFilters(shown) ? "No transactions match." : review ? "Nothing needs review." : "No transactions yet.";

  return (
    <TransactionsTable
      rows={page.items}
      empty={empty}
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
