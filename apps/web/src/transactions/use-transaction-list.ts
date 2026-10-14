import { usePrefetchQuery, useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi, useMatch } from "@tanstack/react-router";
import { transactionListQuery, transactionReviewListQuery } from "@/api/transactions";
import { localAsOf } from "@/as-of";
import { useListSearch } from "@/lists/use-list-search";

const allRoute = getRouteApi("/transactions");
const reviewRoute = getRouteApi("/transactions_/review");

/** True on the Needs review page. The two pages show the same table (decision 0047). */
export function useOnReview() {
  return useMatch({ from: "/transactions_/review", shouldThrow: false }) !== undefined;
}

/** The filters, the sort order and the page of the All page. */
export function useAllSearch() {
  return useListSearch(allRoute.useSearch(), allRoute.useNavigate(), { sort: "date", dir: "desc" });
}

/** The filters, the sort order and the page of the Needs review page. It also sorts by confidence (decision 0049). */
export function useReviewSearch() {
  return useListSearch(reviewRoute.useSearch(), reviewRoute.useNavigate(), { sort: "date", dir: "desc" });
}

/**
 * The search of the page in the URL. The two pages have the same filters and pages. Their sort columns are not the
 * same: a sort control calls `useAllSearch` or `useReviewSearch`. The page does not change while the screen is
 * on it, thus each render calls the same hooks.
 */
export function useTransactionSearch() {
  const useSearchOfPage = useOnReview() ? useReviewSearch : useAllSearch;
  return useSearchOfPage();
}

/** The page of the All page. The page on the screen stays while a new page loads. */
function useAllPage() {
  const list = useAllSearch();
  return { ...list, page: useSuspenseQuery(transactionListQuery(list.shown, localAsOf())).data };
}

/** The page of the Needs review page, with the counts of the levels on all pages. */
export function useReviewPage() {
  const list = useReviewSearch();
  return { ...list, page: useSuspenseQuery(transactionReviewListQuery(list.shown, localAsOf())).data };
}

/**
 * The page of transactions for the URL. Each part of the screen that shows the page calls this hook.
 * The parts share one read.
 */
export function useTransactionPage() {
  const usePageOfScreen = useOnReview() ? useReviewPage : useAllPage;
  return usePageOfScreen();
}

function usePrefetchAll() {
  usePrefetchQuery(transactionListQuery(useAllSearch().shown, localAsOf()));
}

function usePrefetchReview() {
  usePrefetchQuery(transactionReviewListQuery(useReviewSearch().shown, localAsOf()));
}

/** Starts the read of the page of the URL. */
export function usePrefetchTransactionPage() {
  const usePrefetchOfPage = useOnReview() ? usePrefetchReview : usePrefetchAll;
  usePrefetchOfPage();
}
