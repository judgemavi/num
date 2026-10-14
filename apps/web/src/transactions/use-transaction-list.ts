import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { transactionListQuery } from "@/api/transactions";
import { localAsOf } from "@/as-of";
import { useListSearch } from "@/lists/use-list-search";

const transactionsRoute = getRouteApi("/transactions");

/** The filters, the sort order and the page of the Transactions list in the URL. */
export function useTransactionSearch() {
  return useListSearch(transactionsRoute.useSearch(), transactionsRoute.useNavigate(), { sort: "date", dir: "desc" });
}

/**
 * The page of transactions for the URL. Each part of the screen that shows the page calls this hook.
 * The parts share one read. The page on the screen stays while a new page loads.
 */
export function useTransactionPage() {
  const list = useTransactionSearch();
  return { ...list, page: useSuspenseQuery(transactionListQuery(list.shown, localAsOf())).data };
}
