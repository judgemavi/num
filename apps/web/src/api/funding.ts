import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";
import { localAsOf } from "@/as-of";
import { bucketError } from "@/buckets/format";

/** The money that is not in a bucket. */
export function fundingPositionQuery(asOf: string) {
  return queryOptions({
    queryKey: ["funding-position", asOf],
    queryFn: () => unwrap(api.funding.position.$get({ query: { asOf } })),
  });
}

/** The monthly amount of each bucket for the month of `asOf`, and the amount that is still owed. */
export function fundingOwedQuery(asOf: string) {
  return queryOptions({
    queryKey: ["funding-owed", asOf],
    queryFn: () => unwrap(api.funding.owed.$get({ query: { asOf } })),
  });
}

/** The funding of each month, with the months that the user undid. */
export function fundingMonthsQuery() {
  return queryOptions({
    queryKey: ["funding-months"],
    queryFn: async () => (await unwrap(api.funding.months.$get())).items,
  });
}

/** True when the answer of a fill shows a payment or a new link. The rule in `main.tsx` reads only such a fill. */
export function fillPaid(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    "payments" in result &&
    "linked" in result &&
    (result.payments !== 0 || result.linked !== 0)
  );
}

/**
 * The automatic fill (decision 0059). It first links the transactions that match an occurrence of a commitment or an
 * income (decision 0062), because a link changes the balances. The browser sends the date of today.
 */
export function useFill() {
  return useMutation({
    meta: { fill: true },
    mutationFn: async () => {
      const asOf = localAsOf();
      const { linked } = await unwrap(api.buckets["auto-link"].$post({ query: { asOf } }));
      return { ...(await unwrap(api.funding.fill.$post({ query: { asOf } }))), linked };
    },
  });
}

/** Pay a month again after the user undid its funding. */
export function useFundAgain() {
  return useMutation({
    meta: { errorText: bucketError },
    mutationFn: (month: string) => unwrap(api.funding.months[":month"].again.$post({ param: { month }, query: { asOf: localAsOf() } })),
  });
}

export function useUndoMonthFunding() {
  return useMutation({
    meta: { errorText: bucketError },
    mutationFn: (month: string) => unwrap(api.funding.months[":month"].undo.$post({ param: { month } })),
  });
}
