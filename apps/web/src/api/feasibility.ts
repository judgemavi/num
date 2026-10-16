import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";

/** Goal feasibility for the month of `asOf`. */
export function feasibilityQuery(asOf: string) {
  return queryOptions({
    queryKey: ["buckets", "goals-feasibility", asOf],
    queryFn: () => unwrap(api.goals.feasibility.$get({ query: { asOf } })),
  });
}
