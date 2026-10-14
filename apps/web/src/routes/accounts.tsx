import { accountListQuerySchema } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { AccountsScreen } from "@/accounts/accounts-screen";

export const Route = createFileRoute("/accounts")({
  validateSearch: accountListQuerySchema,
  search: {
    middlewares: [stripSearchParams({ page: 1, pageSize: 50, archived: false })],
  },
  component: AccountsScreen,
});
