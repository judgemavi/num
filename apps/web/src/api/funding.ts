import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";
import { localAsOf } from "@/as-of";

/** The monthly amount of each bucket for the month of `asOf`, and the amount that is still owed. */
export function fundingOwedQuery(asOf: string) {
  return queryOptions({
    queryKey: ["funding", "owed", asOf],
    queryFn: () => unwrap(api.funding.owed.$get({ query: { asOf } })),
  });
}

/** Available to spend and its parts. */
export function availableQuery(asOf: string) {
  return queryOptions({
    queryKey: ["funding-available", asOf],
    queryFn: () => unwrap(api.funding.available.$get({ query: { asOf } })),
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
 * The automatic fill. It first links the transactions that match an occurrence of a commitment or an
 * income, because a link changes the balances. The browser sends the date of today.
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
