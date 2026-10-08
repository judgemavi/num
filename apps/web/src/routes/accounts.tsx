import { accountListQuerySchema, type AccountListQuery } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { AccountsScreen } from "@/accounts/accounts-screen";
import { withEdit } from "@/editors/page-search";

type Search = AccountListQuery & { edit?: string };

export const Route = createFileRoute("/accounts")({
  validateSearch: (search: Record<string, unknown>): Search => withEdit(accountListQuerySchema, search),
  search: {
    middlewares: [stripSearchParams<Search>({ page: 1, pageSize: 50, archived: false, edit: undefined })],
  },
  component: AccountsScreen,
});
