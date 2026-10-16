import { categoryListQuery, groupListQuery } from "@/api/categories";
import { pageQuery } from "@/editors/page-search";
import { categoryListQuerySchema, searchWithDefaults } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { CategoriesPage } from "@/settings/categories-page";

export const Route = createFileRoute("/settings/categories")({
  validateSearch: searchWithDefaults(categoryListQuerySchema),
  search: {
    middlewares: [stripSearchParams({ page: 1, pageSize: 50, archived: false })],
  },
  loaderDeps: ({ search }) => pageQuery(search),
  loader: ({ context, deps }) => {
    void context.queryClient.prefetchQuery(categoryListQuery(deps));
    void context.queryClient.prefetchQuery(groupListQuery());
  },
  component: CategoriesPage,
});
