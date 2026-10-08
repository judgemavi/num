import { categoryListQuerySchema, type CategoryListQuery } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { withEdit } from "@/editors/page-search";
import { CategoriesPage } from "@/settings/categories-page";

type Search = CategoryListQuery & { edit?: string };

export const Route = createFileRoute("/settings/categories")({
  validateSearch: (search: Record<string, unknown>): Search => withEdit(categoryListQuerySchema, search),
  search: {
    middlewares: [stripSearchParams<Search>({ page: 1, pageSize: 50, archived: false, edit: undefined })],
  },
  component: CategoriesPage,
});
