import { tagListQuerySchema, type TagListQuery } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { withEdit } from "@/editors/page-search";
import { TagsPage } from "@/settings/tags-page";

type Search = TagListQuery & { edit?: string };

export const Route = createFileRoute("/settings/tags")({
  validateSearch: (search: Record<string, unknown>): Search => withEdit(tagListQuerySchema, search),
  search: {
    middlewares: [stripSearchParams<Search>({ page: 1, pageSize: 50, archived: false, edit: undefined })],
  },
  component: TagsPage,
});
