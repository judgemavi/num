import type { InsightsSearch } from "@num/shared";
import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";

export function insightsQuery(asOf: string, { group: _group, ...request }: InsightsSearch) {
  return queryOptions({
    queryKey: ["insights", asOf, request],
    queryFn: () => unwrap(api.insights.$get({ query: { ...request, asOf } })),
  });
}

export function hygieneQuery(asOf: string) {
  return queryOptions({
    queryKey: ["hygiene", asOf],
    queryFn: () => unwrap(api.hygiene.$get({ query: { asOf } })),
  });
}
