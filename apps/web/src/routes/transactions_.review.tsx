import { searchWithDefaults, transactionListQuerySchema } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { TransactionsScreen } from "@/transactions/transactions-screen";

/** Needs review: the Transactions table with only the rows that need review (decision 0047). */
export const Route = createFileRoute("/transactions_/review")({
  validateSearch: searchWithDefaults(transactionListQuerySchema),
  search: {
    middlewares: [stripSearchParams({ page: 1, pageSize: 50, uncategorized: false, automatic: false })],
  },
  component: TransactionsScreen,
});
