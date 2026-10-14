import { tagListQuerySchema } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { TagsPage } from "@/settings/tags-page";

export const Route = createFileRoute("/settings/tags")({
  validateSearch: tagListQuerySchema,
  search: {
    middlewares: [stripSearchParams({ page: 1, pageSize: 50, archived: false })],
  },
  component: TagsPage,
});
