import { accountActivityQuerySchema, searchWithDefaults } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { AccountScreen } from "@/accounts/account-screen";
import { accountQuery } from "@/api/accounts";
import { bankBalanceListQuery } from "@/api/bank-balances";
import { accountImportsQuery } from "@/api/imports";

export const Route = createFileRoute("/accounts_/$accountId")({
  validateSearch: searchWithDefaults(accountActivityQuerySchema),
  search: {
    middlewares: [stripSearchParams({ page: 1 })],
  },
  // The lists of the page are under the account. Their reads start here, thus they do not wait for the read of the account.
  loader: ({ context: { queryClient }, params: { accountId } }) => {
    void queryClient.prefetchQuery(accountQuery(accountId));
    void queryClient.prefetchQuery(bankBalanceListQuery(accountId));
    void queryClient.prefetchQuery(accountImportsQuery(accountId));
  },
  component: AccountScreen,
});
