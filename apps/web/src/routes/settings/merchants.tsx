import { merchantListQuery } from "@/api/merchants";
import { pageQuery } from "@/editors/page-search";
import { merchantListQuerySchema, searchWithDefaults } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { MerchantsPage } from "@/settings/merchants-page";

export const Route = createFileRoute("/settings/merchants")({
  validateSearch: searchWithDefaults(merchantListQuerySchema),
  search: {
    middlewares: [stripSearchParams({ page: 1, pageSize: 50, archived: false })],
  },
  loaderDeps: ({ search }) => pageQuery(search),
  loader: ({ context, deps }) => {
    void context.queryClient.prefetchQuery(merchantListQuery(deps));
  },
  component: MerchantsPage,
});
