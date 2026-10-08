import { transactionListQuerySchema, type TransactionListQuery } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { TransactionsScreen } from "@/transactions/transactions-screen";

export const Route = createFileRoute("/transactions")({
  validateSearch: (search: Record<string, unknown>): TransactionListQuery => transactionListQuerySchema.parse(search),
  search: {
    middlewares: [stripSearchParams<TransactionListQuery>({ page: 1, pageSize: 50, uncategorized: false })],
  },
  component: TransactionsScreen,
});
