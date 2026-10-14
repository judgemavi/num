import type { BucketCover, BucketCreate, BucketEventCreate, BucketListQuery, BucketWrite } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";
import { activeAndArchived, allPages, fullPage } from "@/api/pages";

type BucketSearch = Partial<Pick<BucketListQuery, "archived" | "sort" | "dir">>;

function loadBuckets(search: BucketSearch) {
  return allPages((page) => unwrap(api.buckets.$get({ query: { archived: search.archived, sort: search.sort, dir: search.dir, page, pageSize: fullPage } })));
}

/** The Buckets screen list. It reads all pages. */
export function bucketListQuery(search: BucketListQuery) {
  return queryOptions({
    queryKey: ["buckets", search],
    queryFn: () => loadBuckets(search),
  });
}

export function activeBucketsQuery() {
  return queryOptions({
    queryKey: ["buckets", "editor"],
    queryFn: () => loadBuckets({ archived: false, sort: "name", dir: "asc" }),
  });
}

/** The active buckets that can cover an overspent bucket. The list waits until `enabled` is true. */
export function coverSourcesQuery(enabled: boolean) {
  return queryOptions({
    queryKey: ["buckets", "cover-sources"],
    enabled,
    queryFn: () => loadBuckets({ archived: false }),
  });
}

/** The active buckets and the archived buckets. The Bucket editor uses them to find the categories that are in a bucket. */
export function bucketOptionsQuery() {
  return queryOptions({
    queryKey: ["buckets", "category-map"],
    queryFn: () => activeAndArchived(loadBuckets),
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

export function bucketQuery(id: string | null) {
  return queryOptions({
    queryKey: ["bucket", id],
    enabled: id !== null,
    queryFn: () => unwrap(api.buckets[":id"].$get({ param: { id: id ?? "" } })),
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
    mutationFn: ({ id, body }: { id: string; body: BucketWrite }) => unwrap(api.buckets[":id"].$patch({ param: { id }, json: body })),
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
