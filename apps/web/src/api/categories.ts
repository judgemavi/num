import type { CategoryUpdate, CategoryListQuery } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";
import { activeAndArchived, allPages, fullPage } from "@/api/pages";

type CategorySearch = Partial<Pick<CategoryListQuery, "archived" | "groupId" | "sort" | "dir">>;

function loadCategories(search: CategorySearch) {
  return allPages((page) => unwrap(api.categories.$get({ query: { archived: search.archived, groupId: search.groupId, sort: search.sort, dir: search.dir, page, pageSize: fullPage } })));
}

export function categoryListQuery(search: CategorySearch) {
  return queryOptions({
    queryKey: ["categories", search],
    queryFn: () => loadCategories(search),
  });
}

export function categoryOptionsQuery() {
  return queryOptions({
    queryKey: ["categories", "options"],
    queryFn: () => activeAndArchived(loadCategories),
  });
}

export function categoryQuery(id: string | null) {
  return queryOptions({
    queryKey: ["category", id],
    enabled: id !== null,
    queryFn: () => unwrap(api.categories[":id"].$get({ param: { id: id ?? "" } })),
  });
}

/** Create a category (`id` is null) or change a category. */
export function useSaveCategory() {
  return useMutation({
    mutationFn: ({ id, body }: { id: string | null; body: CategoryUpdate }) =>
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

export function groupQuery(id: string | null) {
  return queryOptions({
    queryKey: ["category-group", id],
    enabled: id !== null,
    queryFn: () => unwrap(api["category-groups"][":id"].$get({ param: { id: id ?? "" } })),
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

export function useDeleteGroup() {
  return useMutation({
    mutationFn: (id: string) => unwrap(api["category-groups"][":id"].$delete({ param: { id } })),
  });
}
