import type { InsightsSearch } from "@num/shared";
import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";

export function insightsQuery(asOf: string, { group: _group, by: _by, ...request }: InsightsSearch) {
  return queryOptions({
    queryKey: ["insights", asOf, request],
    queryFn: () => unwrap(api.insights.$get({ query: { ...request, asOf } })),
  });
}

/** The items of Home "Needs you": only the checks that fail. */
export function needsYouQuery(asOf: string) {
  return queryOptions({
    queryKey: ["needs-you", asOf],
    queryFn: () => unwrap(api["needs-you"].$get({ query: { asOf } })),
  });
}
