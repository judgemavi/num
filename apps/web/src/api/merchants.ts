import type { MerchantListQuery } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";
import { activeAndArchived, allPages, fullPage } from "@/api/pages";

type MerchantSearch = Partial<Pick<MerchantListQuery, "archived" | "sort" | "dir">>;

function loadMerchants(search: MerchantSearch) {
  return allPages((page) => unwrap(api.merchants.$get({ query: { archived: search.archived, sort: search.sort, dir: search.dir, page, pageSize: fullPage } })));
}

export function merchantListQuery(search: MerchantSearch) {
  return queryOptions({
    queryKey: ["merchants", search],
    queryFn: () => loadMerchants(search),
  });
}

export function merchantOptionsQuery() {
  return queryOptions({
    queryKey: ["merchants", "options"],
    queryFn: () => activeAndArchived(loadMerchants),
  });
}

export function merchantQuery(id: string | null) {
  return queryOptions({
    queryKey: ["merchant", id],
    enabled: id !== null,
    queryFn: () => unwrap(api.merchants[":id"].$get({ param: { id: id ?? "" } })),
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
