import type { InsightsSearch } from "@num/shared";
import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";

export function insightsQuery(asOf: string, search: InsightsSearch) {
  return queryOptions({
    queryKey: ["insights", asOf, search],
    queryFn: () => unwrap(api.insights.$get({ query: { ...search, asOf } })),
  });
}

export function hygieneQuery(asOf: string) {
  return queryOptions({
    queryKey: ["hygiene", asOf],
    queryFn: () => unwrap(api.hygiene.$get({ query: { asOf } })),
  });
}
