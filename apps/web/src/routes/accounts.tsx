import { accountListQuerySchema, type AccountListQuery } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { AccountsScreen } from "@/accounts/accounts-screen";

export const Route = createFileRoute("/accounts")({
  validateSearch: (search: Record<string, unknown>): AccountListQuery => accountListQuerySchema.parse(search),
  search: {
    middlewares: [stripSearchParams<AccountListQuery>({ page: 1, pageSize: 50, archived: false })],
  },
  component: AccountsScreen,
});
