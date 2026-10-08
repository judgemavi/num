import { tagListQuerySchema, type TagListQuery } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { TagsPage } from "@/settings/tags-page";

export const Route = createFileRoute("/settings/tags")({
  validateSearch: (search: Record<string, unknown>): TagListQuery => tagListQuerySchema.parse(search),
  search: {
    middlewares: [stripSearchParams<TagListQuery>({ page: 1, pageSize: 50, archived: false })],
  },
  component: TagsPage,
});
