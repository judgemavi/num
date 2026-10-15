import type { BucketCreate } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, formWrite, unwrap } from "@/api/client";
import { bucketError } from "@/buckets/format";

/** The changed, missed, ambiguous and detected schedules. */
export function scheduleSignalsQuery(asOf: string) {
  return queryOptions({
    queryKey: ["schedule-signals", asOf],
    queryFn: () => unwrap(api.buckets.signals.$get({ query: { asOf } })),
  });
}

/** The occurrences of all active schedules in the next 30 days (decision 0055). */
export function upcomingQuery(asOf: string) {
  return queryOptions({
    queryKey: ["upcoming-occurrences", asOf],
    queryFn: () => unwrap(api.buckets.upcoming.$get({ query: { asOf } })),
  });
}

export function occurrencesQuery(bucketId: string, asOf: string) {
  return queryOptions({
    queryKey: ["occurrences", bucketId, asOf],
    queryFn: () => unwrap(api.buckets[":id"].occurrences.$get({ param: { id: bucketId }, query: { asOf } })),
  });
}

/** Add a schedule that the app detected, with one click. */
export function useAddDetectedSchedule() {
  return useMutation({
    meta: { errorText: bucketError },
    mutationFn: ({ asOf, body }: { asOf: string; body: BucketCreate }) => unwrap(api.buckets.$post({ query: { asOf }, json: body })),
  });
}

type OccurrenceRef = { bucketId: string; dueDate: string };

function linkOccurrence({ bucketId, dueDate, transactionId }: OccurrenceRef & { transactionId: string }) {
  return unwrap(api.buckets[":id"].occurrences[":dueDate"].link.$post({ param: { id: bucketId, dueDate }, json: { transactionId } }));
}

export function useLinkOccurrence() {
  return useMutation({ meta: formWrite, mutationFn: linkOccurrence });
}

export function useUnlinkOccurrence() {
  return useMutation({
    meta: { errorText: bucketError },
    mutationFn: ({ bucketId, dueDate }: OccurrenceRef) =>
      unwrap(api.buckets[":id"].occurrences[":dueDate"].unlink.$post({ param: { id: bucketId, dueDate } })),
  });
}

export function useSkipOccurrence() {
  return useMutation({
    meta: formWrite,
    mutationFn: ({ bucketId, dueDate, reason }: OccurrenceRef & { reason: string }) =>
      unwrap(api.buckets[":id"].occurrences[":dueDate"].skip.$post({ param: { id: bucketId, dueDate }, json: { reason } })),
  });
}

export function useRestoreOccurrence() {
  return useMutation({
    meta: { errorText: bucketError },
    mutationFn: ({ bucketId, dueDate }: OccurrenceRef) =>
      unwrap(api.buckets[":id"].occurrences[":dueDate"].restore.$post({ param: { id: bucketId, dueDate } })),
  });
}
