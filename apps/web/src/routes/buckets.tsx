import { bucketListQuerySchema, searchWithDefaults } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { BucketsScreen } from "@/buckets/buckets-screen";

export const Route = createFileRoute("/buckets")({
  validateSearch: searchWithDefaults(bucketListQuerySchema),
  search: {
    middlewares: [stripSearchParams({ page: 1, pageSize: 50, archived: false })],
  },
  component: BucketsScreen,
});
