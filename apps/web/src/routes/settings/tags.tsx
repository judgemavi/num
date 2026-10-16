import { tagListQuery } from "@/api/tags";
import { pageQuery } from "@/editors/page-search";
import { searchWithDefaults, tagListQuerySchema } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { TagsPage } from "@/settings/tags-page";

export const Route = createFileRoute("/settings/tags")({
  validateSearch: searchWithDefaults(tagListQuerySchema),
  search: {
    middlewares: [stripSearchParams({ page: 1, pageSize: 50, archived: false })],
  },
  loaderDeps: ({ search }) => pageQuery(search),
  loader: ({ context, deps }) => {
    void context.queryClient.prefetchQuery(tagListQuery(deps));
  },
  component: TagsPage,
});
