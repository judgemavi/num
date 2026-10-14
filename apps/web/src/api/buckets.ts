import type { BucketCover, BucketCreate, BucketEventCreate, BucketListQuery, BucketUpdate } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";
import { activeAndArchived, allPages, fullPage, type ListFilters } from "@/api/pages";

/** The Buckets list. It reads all pages. The key has only the values that the request uses. */
export function bucketListQuery({ archived, sort, dir }: ListFilters<BucketListQuery>) {
  const filters = { archived, sort, dir };
  return queryOptions({
    queryKey: ["buckets", filters],
    queryFn: () => allPages((page) => unwrap(api.buckets.$get({ query: { ...filters, page, pageSize: fullPage } }))),
  });
}

/** The buckets that are not archived, in name order. */
export function activeBucketsQuery() {
  return bucketListQuery({ archived: false, sort: "name", dir: "asc" });
}

/** The active buckets and the archived buckets. The Bucket editor uses them to find the categories that are in a bucket. */
export function bucketOptionsQuery() {
  return queryOptions({
    queryKey: ["buckets", "category-map"],
    queryFn: ({ client }) => activeAndArchived((archived) => client.fetchQuery(bucketListQuery({ archived }))),
  });
}

export function overspentQuery() {
  return queryOptions({
    queryKey: ["buckets", "overspent"],
    queryFn: async () => (await unwrap(api.buckets.overspent.$get())).items,
  });
}

export function bucketEventsQuery() {
  return queryOptions({
    queryKey: ["bucket-events"],
    queryFn: async () => (await unwrap(api.buckets.events.$get())).items,
  });
}

export function bucketQuery(id: string) {
  return queryOptions({
    queryKey: ["bucket", id],
    queryFn: () => unwrap(api.buckets[":id"].$get({ param: { id } })),
  });
}

/** Create a bucket. The opening state of the bucket uses `asOf`. */
export function useCreateBucket() {
  return useMutation({
    mutationFn: ({ asOf, body }: { asOf: string; body: BucketCreate }) => unwrap(api.buckets.$post({ query: { asOf }, json: body })),
  });
}

export function useUpdateBucket() {
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: BucketUpdate }) => unwrap(api.buckets[":id"].$patch({ param: { id }, json: body })),
  });
}

export function useArchiveBucket() {
  return useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) =>
      unwrap(restore ? api.buckets[":id"].restore.$post({ param: { id } }) : api.buckets[":id"].archive.$post({ param: { id } })),
  });
}

/** Fund a bucket, release money from a bucket, or move money to a second bucket. */
export function useAddBucketEvent() {
  return useMutation({
    mutationFn: ({ bucketId, asOf, body }: { bucketId: string; asOf: string; body: BucketEventCreate }) =>
      unwrap(api.buckets[":id"].events.$post({ param: { id: bucketId }, query: { asOf }, json: body })),
  });
}

export function useUndoBucketEvent() {
  return useMutation({
    mutationFn: ({ bucketId, eventId }: { bucketId: string; eventId: string }) =>
      unwrap(api.buckets[":id"].events[":eventId"].undo.$post({ param: { id: bucketId, eventId } })),
  });
}

/** Cover an overspent bucket with money from a second bucket. */
export function useCoverBucket() {
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: BucketCover }) => unwrap(api.buckets[":id"].cover.$post({ param: { id }, json: body })),
  });
}
