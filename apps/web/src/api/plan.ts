import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";

/** The plan of the month that contains `asOf`. */
export function monthPlanQuery(asOf: string) {
  const month = asOf.slice(0, 7);
  return queryOptions({
    queryKey: ["month-plan", asOf, month],
    queryFn: () => unwrap(api.plan.$get({ query: { asOf, month } })),
  });
}

export function forecastQuery(asOf: string) {
  return queryOptions({
    queryKey: ["forecast", asOf],
    queryFn: () => unwrap(api.forecast.$get({ query: { asOf } })),
  });
}
