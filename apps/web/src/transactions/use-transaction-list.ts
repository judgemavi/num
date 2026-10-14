import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi, useMatch } from "@tanstack/react-router";
import { transactionListQuery } from "@/api/transactions";
import { localAsOf } from "@/as-of";
import { useListSearch } from "@/lists/use-list-search";

const allRoute = getRouteApi("/transactions");
const reviewRoute = getRouteApi("/transactions_/review");

/** True on the Needs review page. The two pages show the same table (decision 0047). */
export function useOnReview() {
  return useMatch({ from: "/transactions_/review", shouldThrow: false }) !== undefined;
}

/** The filters, the sort order and the page of the Transactions list of the page in the URL. */
export function useTransactionSearch() {
  const route = useOnReview() ? reviewRoute : allRoute;
  return useListSearch(route.useSearch(), route.useNavigate(), { sort: "date", dir: "desc" });
}

/**
 * The page of transactions for the URL. Each part of the screen that shows the page calls this hook.
 * The parts share one read. The page on the screen stays while a new page loads.
 */
export function useTransactionPage() {
  const list = useTransactionSearch();
  return { ...list, page: useSuspenseQuery(transactionListQuery(list.shown, localAsOf(), useOnReview())).data };
}
