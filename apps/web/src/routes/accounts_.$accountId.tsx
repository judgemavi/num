import { accountActivityQuerySchema, type AccountActivityQuery } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { AccountScreen } from "@/accounts/account-screen";
import { withEdit } from "@/editors/page-search";

type Search = AccountActivityQuery & { edit?: string };

export const Route = createFileRoute("/accounts_/$accountId")({
  validateSearch: (search: Record<string, unknown>): Search => withEdit(accountActivityQuerySchema, search),
  search: {
    middlewares: [stripSearchParams<Search>({ page: 1, reconcile: false, edit: undefined })],
  },
  component: AccountScreen,
});
