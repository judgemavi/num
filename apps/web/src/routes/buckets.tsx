import { bucketListQuerySchema, type BucketListQuery } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { BucketsScreen } from "@/buckets/buckets-screen";
import { withEdit } from "@/editors/page-search";

type Search = BucketListQuery & { edit?: string };

export const Route = createFileRoute("/buckets")({
  validateSearch: (search: Record<string, unknown>): Search => withEdit(bucketListQuerySchema, search),
  search: {
    middlewares: [stripSearchParams<Search>({ page: 1, pageSize: 50, archived: false, edit: undefined })],
  },
  component: BucketsScreen,
});
