import { localAsOf } from "@/as-of";
import { transactionListQuery } from "@/api/transactions";
import { pageQuery } from "@/editors/page-search";
import { searchWithDefaults, transactionListQuerySchema } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { TransactionsScreen } from "@/transactions/transactions-screen";

export const Route = createFileRoute("/transactions")({
  validateSearch: searchWithDefaults(transactionListQuerySchema),
  search: {
    middlewares: [stripSearchParams({ page: 1, pageSize: 50, uncategorized: false, automatic: false })],
  },
  loaderDeps: ({ search }) => pageQuery(search),
  loader: ({ context, deps }) => {
    void context.queryClient.prefetchQuery(transactionListQuery(deps, localAsOf()));
  },
  component: TransactionsScreen,
});
