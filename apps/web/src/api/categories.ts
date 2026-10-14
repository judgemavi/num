import type { CategoryCreate, CategoryListQuery } from "@num/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";
import { activeAndArchived, allPages, fullPage, type ListFilters } from "@/api/pages";

/** The Categories list. It reads all pages. The key has only the values that the request uses. */
export function categoryListQuery({ archived, groupId, sort, dir }: ListFilters<CategoryListQuery>) {
  const filters = { archived, groupId, sort, dir };
  return queryOptions({
    queryKey: ["categories", filters],
    queryFn: () => allPages((page) => unwrap(api.categories.$get({ query: { ...filters, page, pageSize: fullPage } }))),
  });
}

export function categoryOptionsQuery() {
  return queryOptions({
    queryKey: ["categories", "options"],
    queryFn: ({ client }) => activeAndArchived((archived) => client.fetchQuery(categoryListQuery({ archived }))),
  });
}

export function categoryQuery(id: string) {
  return queryOptions({
    queryKey: ["category", id],
    queryFn: () => unwrap(api.categories[":id"].$get({ param: { id } })),
  });
}

/** Create a category (`id` is null) or change a category. */
export function useSaveCategory() {
  return useMutation({
    mutationFn: ({ id, body }: { id: string | null; body: CategoryCreate }) =>
      unwrap(id ? api.categories[":id"].$patch({ param: { id }, json: body }) : api.categories.$post({ json: body })),
  });
}

export function useArchiveCategory() {
  return useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) =>
      unwrap(
        restore ? api.categories[":id"].restore.$post({ param: { id } }) : api.categories[":id"].archive.$post({ param: { id } }),
      ),
  });
}

export function groupListQuery() {
  return queryOptions({
    queryKey: ["category-groups"],
    queryFn: async () => (await unwrap(api["category-groups"].$get())).items,
  });
}

export function groupQuery(id: string) {
  return queryOptions({
    queryKey: ["category-group", id],
    queryFn: () => unwrap(api["category-groups"][":id"].$get({ param: { id } })),
  });
}

/** Create a group (`id` is null) or rename a group. */
export function useSaveGroup() {
  return useMutation({
    mutationFn: ({ id, name }: { id: string | null; name: string }) =>
      unwrap(
        id ? api["category-groups"][":id"].$patch({ param: { id }, json: { name } }) : api["category-groups"].$post({ json: { name } }),
      ),
  });
}

/** Delete a group. The read of the group leaves the cache before the rule in `main.tsx` runs. */
export function useDeleteGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const deleted = await unwrap(api["category-groups"][":id"].$delete({ param: { id } }));
      queryClient.removeQueries({ queryKey: groupQuery(id).queryKey });
      return deleted;
    },
  });
}
