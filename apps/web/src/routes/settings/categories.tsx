import { categoryListQuerySchema, type CategoryListQuery } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { CategoriesPage } from "@/settings/categories-page";

export const Route = createFileRoute("/settings/categories")({
  validateSearch: (search: Record<string, unknown>): CategoryListQuery => categoryListQuerySchema.parse(search),
  search: {
    middlewares: [stripSearchParams<CategoryListQuery>({ page: 1, pageSize: 50, archived: false })],
  },
  component: CategoriesPage,
});
