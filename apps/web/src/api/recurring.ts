import type { PlanCreate, PlanListQuery, PlanUpdate } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { useArchiveWrite } from "@/api/archive";
import { api, formWrite, unwrap } from "@/api/client";
import { allPages, fullPage } from "@/api/pages";
import { planError } from "@/recurring/format";

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

/** Create a plan (`id` is null) or change the fields of a plan that are in the patch. */
export function savePlan(input: { id: null; body: PlanCreate } | { id: string; body: PlanUpdate }) {
  return unwrap(input.id === null ? api.recurring.$post({ json: input.body }) : api.recurring[":id"].$patch({ param: { id: input.id }, json: input.body }));
}

export function useSavePlan() {
  return useMutation({ meta: formWrite, mutationFn: savePlan });
}

/** Add a plan that the app detected, with one click. */
export function useAddDetectedPlan() {
  return useMutation({ meta: { errorText: planError }, mutationFn: (body: PlanCreate) => savePlan({ id: null, body }) });
}

export function useArchivePlan() {
  return useArchiveWrite("Recurring item archived.", planError, ({ id, restore }) =>
    unwrap(restore ? api.recurring[":id"].restore.$post({ param: { id } }) : api.recurring[":id"].archive.$post({ param: { id } })),
  );
}

type OccurrenceRef = { planId: string; dueDate: string };

export function linkOccurrence({ planId, dueDate, transactionId }: OccurrenceRef & { transactionId: string }) {
  return unwrap(api.recurring[":id"].occurrences[":dueDate"].link.$post({ param: { id: planId, dueDate }, json: { transactionId } }));
}

export function useLinkOccurrence() {
  return useMutation({ meta: formWrite, mutationFn: linkOccurrence });
}

export function useUnlinkOccurrence() {
  return useMutation({
    meta: { errorText: planError },
    mutationFn: ({ planId, dueDate }: OccurrenceRef) =>
      unwrap(api.recurring[":id"].occurrences[":dueDate"].unlink.$post({ param: { id: planId, dueDate } })),
  });
}

export function useSkipOccurrence() {
  return useMutation({
    meta: formWrite,
    mutationFn: ({ planId, dueDate, reason }: OccurrenceRef & { reason: string }) =>
      unwrap(api.recurring[":id"].occurrences[":dueDate"].skip.$post({ param: { id: planId, dueDate }, json: { reason } })),
  });
}

export function useRestoreOccurrence() {
  return useMutation({
    meta: { errorText: planError },
    mutationFn: ({ planId, dueDate }: OccurrenceRef) =>
      unwrap(api.recurring[":id"].occurrences[":dueDate"].restore.$post({ param: { id: planId, dueDate } })),
  });
}
