import { searchWithDefaults, transactionListQuerySchema } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { TransactionsScreen } from "@/transactions/transactions-screen";

export const Route = createFileRoute("/transactions")({
  validateSearch: searchWithDefaults(transactionListQuerySchema),
  search: {
    middlewares: [stripSearchParams({ page: 1, pageSize: 50, uncategorized: false, automatic: false, needsReview: false })],
  },
  component: TransactionsScreen,
});
