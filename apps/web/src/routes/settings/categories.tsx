import { categoryListQuerySchema, searchWithDefaults } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { CategoriesPage } from "@/settings/categories-page";

export const Route = createFileRoute("/settings/categories")({
  validateSearch: searchWithDefaults(categoryListQuerySchema),
  search: {
    middlewares: [stripSearchParams({ page: 1, pageSize: 50, archived: false })],
  },
  component: CategoriesPage,
});
