import { accountActivityQuerySchema, type AccountActivityQuery } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { AccountScreen } from "@/accounts/account-screen";

export const Route = createFileRoute("/accounts_/$accountId")({
  validateSearch: (search: Record<string, unknown>): AccountActivityQuery => accountActivityQuerySchema.parse(search),
  search: {
    middlewares: [stripSearchParams<AccountActivityQuery>({ page: 1, reconcile: false })],
  },
  component: AccountScreen,
});
