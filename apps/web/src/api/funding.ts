import type { FundingRunCreate } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";

/** The money that is not in a bucket. */
export function fundingPositionQuery(asOf: string) {
  return queryOptions({
    queryKey: ["funding-position", asOf],
    queryFn: () => unwrap(api.funding.position.$get({ query: { asOf } })),
  });
}

/** The income deposits that can fund buckets. */
export function fundingPaychecksQuery() {
  return queryOptions({
    queryKey: ["funding-paychecks"],
    queryFn: async () => (await unwrap(api.funding.paychecks.$get())).items,
  });
}

/** The proposed amounts for one paycheck. */
export function fundingProposalQuery(incomeTransactionId: string, asOf: string) {
  return queryOptions({
    queryKey: ["funding-proposal", incomeTransactionId, asOf],
    queryFn: () => unwrap(api.funding.proposal.$get({ query: { asOf, incomeTransactionId } })),
  });
}

export function fundingRunsQuery() {
  return queryOptions({
    queryKey: ["funding-runs"],
    queryFn: async () => (await unwrap(api.funding.runs.$get())).items,
  });
}

/** Assign a paycheck to buckets. */
export function useFundPaycheck() {
  return useMutation({
    mutationFn: ({ asOf, body }: { asOf: string; body: FundingRunCreate }) => unwrap(api.funding.runs.$post({ query: { asOf }, json: body })),
  });
}

export function useUndoFundingRun() {
  return useMutation({
    mutationFn: (id: string) => unwrap(api.funding.runs[":id"].undo.$post({ param: { id } })),
  });
}
