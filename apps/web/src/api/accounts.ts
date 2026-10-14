import { accountUpdateSchema, type Account, type AccountCreate, type AccountListQuery, type AccountUpdate, type OpeningSuggestion } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";
import { activeAndArchived, allPages, fullPage } from "@/api/pages";

type AccountSearch = Partial<Pick<AccountListQuery, "archived" | "sort" | "dir">>;

function loadAccounts(search: AccountSearch) {
  return allPages((page) => unwrap(api.accounts.$get({ query: { archived: search.archived, sort: search.sort, dir: search.dir, page, pageSize: fullPage } })));
}

export function accountListQuery(search: AccountSearch) {
  return queryOptions({
    queryKey: ["accounts", search],
    queryFn: () => loadAccounts(search),
  });
}

/** The accounts that are not archived, in name order. */
export function activeAccountsQuery() {
  return accountListQuery({ archived: false, sort: "name", dir: "asc" });
}

export function accountOptionsQuery() {
  return queryOptions({
    queryKey: ["accounts", "options"],
    queryFn: () => activeAndArchived(loadAccounts),
  });
}

export function accountQuery(id: string | null) {
  return queryOptions({
    queryKey: ["account", id],
    enabled: id !== null,
    queryFn: () => unwrap(api.accounts[":id"].$get({ param: { id: id ?? "" } })),
  });
}

/** Create an account (`id` is null) or change an account. */
export function useSaveAccount() {
  return useMutation({
    mutationFn: (input: { id: null; body: AccountCreate } | { id: string; body: AccountUpdate }) =>
      unwrap(input.id === null ? api.accounts.$post({ json: input.body }) : api.accounts[":id"].$patch({ param: { id: input.id }, json: input.body })),
  });
}

export function useArchiveAccount() {
  return useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) =>
      unwrap(
        restore ? api.accounts[":id"].restore.$post({ param: { id } }) : api.accounts[":id"].archive.$post({ param: { id }, json: { confirm: true } }),
      ),
  });
}

/** Set the opening date and the opening balance of an account from a suggestion. The other fields stay the same. */
export function useSetOpeningBalance() {
  return useMutation({
    mutationFn: ({ account, suggestion }: { account: Account; suggestion: OpeningSuggestion }) => {
      const body = accountUpdateSchema.parse({
        name: account.name,
        institution: account.institution,
        kind: account.kind,
        onBudget: account.onBudget,
        openingDate: suggestion.date,
        openingBalance: suggestion.amount,
        paymentPolicy: account.paymentPolicy,
        fixedPayment: account.fixedPayment,
        interestRateMilliPct: account.interestRateMilliPct,
      });
      return unwrap(api.accounts[":id"].$patch({ param: { id: account.id }, json: body }));
    },
  });
}
