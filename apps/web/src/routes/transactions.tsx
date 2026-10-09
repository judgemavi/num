import { transactionListQuerySchema, type TransactionListQuery } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { withEdit } from "@/editors/page-search";
import { TransactionsScreen } from "@/transactions/transactions-screen";

type Search = TransactionListQuery & { edit?: string };

export const Route = createFileRoute("/transactions")({
  validateSearch: (search: Record<string, unknown>): Search => withEdit(transactionListQuerySchema, search),
  search: {
    middlewares: [stripSearchParams<Search>({ page: 1, pageSize: 50, uncategorized: false, automatic: false, needsReview: false, edit: undefined })],
  },
  component: TransactionsScreen,
});
