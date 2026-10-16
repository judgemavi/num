import { bankStatusesQuery } from "@/api/bank-balances";
import { accountListQuery } from "@/api/accounts";
import { pageQuery } from "@/editors/page-search";
import { accountListQuerySchema, searchWithDefaults } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { AccountsScreen } from "@/accounts/accounts-screen";

export const Route = createFileRoute("/accounts")({
  validateSearch: searchWithDefaults(accountListQuerySchema),
  search: {
    middlewares: [stripSearchParams({ page: 1, pageSize: 50, archived: false })],
  },
  loaderDeps: ({ search }) => pageQuery(search),
  loader: ({ context, deps }) => {
    void context.queryClient.prefetchQuery(accountListQuery(deps));
    void context.queryClient.prefetchQuery(bankStatusesQuery());
  },
  component: AccountsScreen,
});
