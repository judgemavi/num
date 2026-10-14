import type { MerchantListQuery } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";
import { activeAndArchived, allPages, fullPage, type ListFilters } from "@/api/pages";

/** The Merchants list. It reads all pages. The key has only the values that the request uses. */
export function merchantListQuery({ archived, sort, dir }: ListFilters<MerchantListQuery>) {
  const filters = { archived, sort, dir };
  return queryOptions({
    queryKey: ["merchants", filters],
    queryFn: () => allPages((page) => unwrap(api.merchants.$get({ query: { ...filters, page, pageSize: fullPage } }))),
  });
}

export function merchantOptionsQuery() {
  return queryOptions({
    queryKey: ["merchants", "options"],
    queryFn: ({ client }) => activeAndArchived((archived) => client.fetchQuery(merchantListQuery({ archived }))),
  });
}

export function merchantQuery(id: string) {
  return queryOptions({
    queryKey: ["merchant", id],
    queryFn: () => unwrap(api.merchants[":id"].$get({ param: { id } })),
  });
}

/** Create a merchant (`id` is null) or rename a merchant. */
export function useSaveMerchant() {
  return useMutation({
    mutationFn: ({ id, name }: { id: string | null; name: string }) =>
      unwrap(id ? api.merchants[":id"].$patch({ param: { id }, json: { name } }) : api.merchants.$post({ json: { name } })),
  });
}

export function useArchiveMerchant() {
  return useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) =>
      unwrap(
        restore ? api.merchants[":id"].restore.$post({ param: { id } }) : api.merchants[":id"].archive.$post({ param: { id } }),
      ),
  });
}

export function useMergeMerchant() {
  return useMutation({
    mutationFn: ({ id, targetId }: { id: string; targetId: string }) =>
      unwrap(api.merchants[":id"].merge.$post({ param: { id }, json: { targetId } })),
  });
}
