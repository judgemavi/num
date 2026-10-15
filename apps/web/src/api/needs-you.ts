import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";

/** The items of Home "Needs you": only the checks that fail. */
export function needsYouQuery(asOf: string) {
  return queryOptions({
    queryKey: ["needs-you", asOf],
    queryFn: () => unwrap(api["needs-you"].$get({ query: { asOf } })),
  });
}
