import type { TagListQuery } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";
import { activeAndArchived, allPages, fullPage, type ListFilters } from "@/api/pages";

/** The Tags list. It reads all pages. The key has only the values that the request uses. */
export function tagListQuery({ archived, sort, dir }: ListFilters<TagListQuery>) {
  const filters = { archived, sort, dir };
  return queryOptions({
    queryKey: ["tags", filters],
    queryFn: () => allPages((page) => unwrap(api.tags.$get({ query: { ...filters, page, pageSize: fullPage } }))),
  });
}

export function tagOptionsQuery() {
  return queryOptions({
    queryKey: ["tags", "options"],
    queryFn: ({ client }) => activeAndArchived((archived) => client.fetchQuery(tagListQuery({ archived }))),
  });
}

export function tagQuery(id: string) {
  return queryOptions({
    queryKey: ["tag", id],
    queryFn: () => unwrap(api.tags[":id"].$get({ param: { id } })),
  });
}

/** Create a tag (`id` is null) or rename a tag. */
export function useSaveTag() {
  return useMutation({
    mutationFn: ({ id, name }: { id: string | null; name: string }) =>
      unwrap(id ? api.tags[":id"].$patch({ param: { id }, json: { name } }) : api.tags.$post({ json: { name } })),
  });
}

export function useArchiveTag() {
  return useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) =>
      unwrap(restore ? api.tags[":id"].restore.$post({ param: { id } }) : api.tags[":id"].archive.$post({ param: { id } })),
  });
}
