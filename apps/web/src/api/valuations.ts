import type { ValuationInput, ValuationUpdate } from "@num/shared";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { valuationError } from "@/accounts/format";
import { api, formWrite, unwrap } from "@/api/client";

export function valuationListQuery(accountId: string) {
  return queryOptions({
    queryKey: ["valuations", accountId],
    queryFn: () => unwrap(api.accounts[":id"].valuations.$get({ param: { id: accountId } })),
  });
}

export function useSaveValuation() {
  return useMutation({
    meta: formWrite,
    mutationFn: (request: { accountId: string } & ({ id: null; body: ValuationInput } | { id: string; body: ValuationUpdate })) => {
      const { accountId, id, body } = request;
      return unwrap(id === null
        ? api.accounts[":id"].valuations.$post({ param: { id: accountId }, json: body })
        : api.accounts[":id"].valuations[":valuationId"].$patch({ param: { id: accountId, valuationId: id }, json: body }));
    },
  });
}

export function useDeleteValuation() {
  const client = useQueryClient();
  return useMutation({
    meta: { errorText: valuationError },
    mutationFn: async ({ accountId, id }: { accountId: string; id: string }) => {
      const removed = await unwrap(api.accounts[":id"].valuations[":valuationId"].$delete({ param: { id: accountId, valuationId: id } }));
      client.removeQueries({ queryKey: ["valuations", accountId, id] });
      return removed;
    },
  });
}
