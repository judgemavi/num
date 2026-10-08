import { bucketListQuerySchema, type BucketListQuery } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { BucketsScreen } from "@/buckets/buckets-screen";

export const Route = createFileRoute("/buckets")({
  validateSearch: (search: Record<string, unknown>): BucketListQuery => bucketListQuerySchema.parse(search),
  search: {
    middlewares: [stripSearchParams<BucketListQuery>({ page: 1, pageSize: 50, archived: false })],
  },
  component: BucketsScreen,
});
