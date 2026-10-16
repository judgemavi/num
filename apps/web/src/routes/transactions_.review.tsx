import { transactionReviewListQuery } from "@/api/transactions";
import { localAsOf } from "@/as-of";
import { pageQuery } from "@/editors/page-search";
import { searchWithDefaults, transactionReviewListQuerySchema } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { TransactionsScreen } from "@/transactions/transactions-screen";

/** Needs review: the Transactions table with only the rows that need review. It also sorts by confidence. */
export const Route = createFileRoute("/transactions_/review")({
  validateSearch: searchWithDefaults(transactionReviewListQuerySchema),
  search: {
    middlewares: [stripSearchParams({ page: 1, pageSize: 50, uncategorized: false, automatic: false })],
  },
  loaderDeps: ({ search }) => pageQuery(search),
  loader: ({ context, deps }) => {
    void context.queryClient.prefetchQuery(transactionReviewListQuery(deps, localAsOf()));
  },
  component: TransactionsScreen,
});
