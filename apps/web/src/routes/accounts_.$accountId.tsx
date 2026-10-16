import { valuationListQuery } from "@/api/valuations";
import { accountActivityQuerySchema, searchWithDefaults, usesValuation } from "@num/shared";
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
  // Start the page reads here. Start valuations as soon as the account kind is known.
  loader: ({ context: { queryClient }, params: { accountId } }) => {
    void queryClient.ensureQueryData(accountQuery(accountId)).then((account) => {
      if (usesValuation(account.kind)) void queryClient.prefetchQuery(valuationListQuery(accountId));
    }).catch(() => undefined);
    void queryClient.prefetchQuery(bankBalanceListQuery(accountId));
    void queryClient.prefetchQuery(accountImportsQuery(accountId));
  },
  component: AccountScreen,
});
