import { bucketListQuery } from "@/api/buckets";
import { pageQuery } from "@/editors/page-search";
import { bucketListQuerySchema, searchWithDefaults } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { BucketsScreen } from "@/buckets/buckets-screen";

export const Route = createFileRoute("/buckets")({
  validateSearch: searchWithDefaults(bucketListQuerySchema),
  search: {
    middlewares: [stripSearchParams({ page: 1, pageSize: 50, archived: false })],
  },
  loaderDeps: ({ search }) => pageQuery(search),
  loader: ({ context, deps }) => {
    void context.queryClient.prefetchQuery(bucketListQuery(deps));
  },
  component: BucketsScreen,
});
