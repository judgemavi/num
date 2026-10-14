import type { AccountCreate, AccountListQuery, AccountUpdate, OpeningSuggestion } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";
import { activeAndArchived, allPages, fullPage, type ListFilters } from "@/api/pages";

/** The Accounts list. It reads all pages. The key has only the values that the request uses. */
export function accountListQuery({ archived, sort, dir }: ListFilters<AccountListQuery>) {
  const filters = { archived, sort, dir };
  return queryOptions({
    queryKey: ["accounts", filters],
    queryFn: () => allPages((page) => unwrap(api.accounts.$get({ query: { ...filters, page, pageSize: fullPage } }))),
  });
}

/** The accounts that are not archived, in name order. */
export function activeAccountsQuery() {
  return accountListQuery({ archived: false, sort: "name", dir: "asc" });
}

export function accountOptionsQuery() {
  return queryOptions({
    queryKey: ["accounts", "options"],
    queryFn: ({ client }) => activeAndArchived((archived) => client.fetchQuery(accountListQuery({ archived }))),
  });
}

export function accountQuery(id: string) {
  return queryOptions({
    queryKey: ["account", id],
    queryFn: () => unwrap(api.accounts[":id"].$get({ param: { id } })),
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

/** Set the opening date and the opening balance of an account from a suggestion. The patch has only these two fields. */
export function useSetOpeningBalance() {
  return useMutation({
    mutationFn: ({ accountId, suggestion }: { accountId: string; suggestion: OpeningSuggestion }) =>
      unwrap(
        api.accounts[":id"].$patch({ param: { id: accountId }, json: { openingBalance: suggestion.amount, openingDate: suggestion.date } }),
      ),
  });
}
