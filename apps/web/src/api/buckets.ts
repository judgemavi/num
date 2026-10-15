import type { BucketCover, BucketCreate, BucketEventCreate, BucketListQuery, BucketUpdate } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { useArchiveWrite } from "@/api/archive";
import { undoToast } from "@/components/undo-toast";
import { api, formWrite, unwrap } from "@/api/client";
import { activeAndArchived, allPages, fullPage, type ListFilters } from "@/api/pages";
import { bucketError } from "@/buckets/format";

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

/** The emergency fund: its balance, its target and the monthly essential spending. The target uses `asOf`. */
export function emergencyFundQuery(asOf: string) {
  return queryOptions({
    queryKey: ["buckets", "emergency", asOf],
    queryFn: () => unwrap(api.buckets.emergency.$get({ query: { asOf } })),
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
    meta: formWrite,
    mutationFn: ({ asOf, body }: { asOf: string; body: BucketCreate }) => unwrap(api.buckets.$post({ query: { asOf }, json: body })),
  });
}

export function useUpdateBucket() {
  return useMutation({
    meta: formWrite,
    mutationFn: ({ id, body }: { id: string; body: BucketUpdate }) => unwrap(api.buckets[":id"].$patch({ param: { id }, json: body })),
  });
}

export function useArchiveBucket() {
  return useArchiveWrite("Bucket archived.", bucketError, ({ id, restore }) =>
    unwrap(restore ? api.buckets[":id"].restore.$post({ param: { id } }) : api.buckets[":id"].archive.$post({ param: { id } })),
  );
}

const eventDone = { fund: "Money assigned.", release: "Money released.", move: "Money moved.", cover: "Covered from Unassigned.", recede: "Money went back to Unassigned." } as const;

/** Fund a bucket, release money from a bucket, or move money to a second bucket. */
export function useAddBucketEvent() {
  const undo = useUndoBucketEvent();
  return useMutation({
    meta: formWrite,
    onSuccess: (event) => undoToast(eventDone[event.kind], () => undo.mutate({ bucketId: event.bucketId, eventId: event.id })),
    mutationFn: ({ bucketId, asOf, body }: { bucketId: string; asOf: string; body: BucketEventCreate }) =>
      unwrap(api.buckets[":id"].events.$post({ param: { id: bucketId }, query: { asOf }, json: body })),
  });
}

export function useUndoBucketEvent() {
  return useMutation({
    meta: { errorText: bucketError },
    mutationFn: ({ bucketId, eventId }: { bucketId: string; eventId: string }) =>
      unwrap(api.buckets[":id"].events[":eventId"].undo.$post({ param: { id: bucketId, eventId } })),
  });
}

/** Cover an overspent bucket with money from a second bucket. */
export function useCoverBucket() {
  const undo = useUndoBucketEvent();
  return useMutation({
    meta: { errorText: bucketError },
    onSuccess: (event) => undoToast("Bucket covered.", () => undo.mutate({ bucketId: event.bucketId, eventId: event.id })),
    mutationFn: ({ id, body }: { id: string; body: BucketCover }) => unwrap(api.buckets[":id"].cover.$post({ param: { id }, json: body })),
  });
}
