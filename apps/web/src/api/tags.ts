import type { TagListQuery } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";
import { activeAndArchived, allPages, fullPage } from "@/api/pages";

type TagSearch = Partial<Pick<TagListQuery, "archived" | "sort" | "dir">>;

function loadTags(search: TagSearch) {
  return allPages((page) => unwrap(api.tags.$get({ query: { archived: search.archived, sort: search.sort, dir: search.dir, page, pageSize: fullPage } })));
}

export function tagListQuery(search: TagSearch) {
  return queryOptions({
    queryKey: ["tags", search],
    queryFn: () => loadTags(search),
  });
}

export function tagOptionsQuery() {
  return queryOptions({
    queryKey: ["tags", "options"],
    queryFn: () => activeAndArchived(loadTags),
  });
}

export function tagQuery(id: string | null) {
  return queryOptions({
    queryKey: ["tag", id],
    enabled: id !== null,
    queryFn: () => unwrap(api.tags[":id"].$get({ param: { id: id ?? "" } })),
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
