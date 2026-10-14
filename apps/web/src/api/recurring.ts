import type { PlanCreate, PlanListQuery } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";
import { allPages, fullPage } from "@/api/pages";

export function activePlansQuery() {
  return queryOptions({
    queryKey: ["plans", "active"],
    queryFn: () =>
      allPages((page) => unwrap(api.recurring.$get({ query: { archived: false, sort: "name", dir: "asc", page, pageSize: fullPage } }))),
  });
}

/** The Recurring screen list. It reads up to 200 plans on one page. */
export function planListQuery(search: PlanListQuery) {
  return queryOptions({
    queryKey: ["plans", search],
    queryFn: () => unwrap(api.recurring.$get({ query: { ...search, pageSize: fullPage } })),
  });
}

export function planQuery(id: string) {
  return queryOptions({
    queryKey: ["plan", id],
    queryFn: () => unwrap(api.recurring[":id"].$get({ param: { id } })),
  });
}

/**
 * Link the transactions that match an occurrence. The Recurring screen runs this before it reads the plans.
 * It is a query, thus it runs again each time the rule in `main.tsx` invalidates the queries.
 */
export function recurringSyncQuery(asOf: string) {
  return queryOptions({
    queryKey: ["recurring-sync", asOf],
    queryFn: () => unwrap(api.recurring["auto-link"].$post({ query: { asOf } })),
  });
}

export function recurringSignalsQuery(asOf: string) {
  return queryOptions({
    queryKey: ["recurring-signals", asOf],
    queryFn: () => unwrap(api.recurring.signals.$get({ query: { asOf } })),
  });
}

export function occurrencesQuery(planId: string, asOf: string) {
  return queryOptions({
    queryKey: ["occurrences", planId, asOf],
    queryFn: () => unwrap(api.recurring[":id"].occurrences.$get({ param: { id: planId }, query: { asOf } })),
  });
}

/** Create a plan (`id` is null) or change a plan. */
export function savePlan({ id, body }: { id: string | null; body: PlanCreate }) {
  return unwrap(id ? api.recurring[":id"].$patch({ param: { id }, json: body }) : api.recurring.$post({ json: body }));
}

export function useSavePlan() {
  return useMutation({ mutationFn: savePlan });
}

export function useArchivePlan() {
  return useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) =>
      unwrap(restore ? api.recurring[":id"].restore.$post({ param: { id } }) : api.recurring[":id"].archive.$post({ param: { id } })),
  });
}

type OccurrenceRef = { planId: string; dueDate: string };

export function linkOccurrence({ planId, dueDate, transactionId }: OccurrenceRef & { transactionId: string }) {
  return unwrap(api.recurring[":id"].occurrences[":dueDate"].link.$post({ param: { id: planId, dueDate }, json: { transactionId } }));
}

export function useLinkOccurrence() {
  return useMutation({ mutationFn: linkOccurrence });
}

export function useUnlinkOccurrence() {
  return useMutation({
    mutationFn: ({ planId, dueDate }: OccurrenceRef) =>
      unwrap(api.recurring[":id"].occurrences[":dueDate"].unlink.$post({ param: { id: planId, dueDate } })),
  });
}

export function useSkipOccurrence() {
  return useMutation({
    mutationFn: ({ planId, dueDate, reason }: OccurrenceRef & { reason: string }) =>
      unwrap(api.recurring[":id"].occurrences[":dueDate"].skip.$post({ param: { id: planId, dueDate }, json: { reason } })),
  });
}

export function useRestoreOccurrence() {
  return useMutation({
    mutationFn: ({ planId, dueDate }: OccurrenceRef) =>
      unwrap(api.recurring[":id"].occurrences[":dueDate"].restore.$post({ param: { id: planId, dueDate } })),
  });
}
