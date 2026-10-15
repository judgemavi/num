import type { QueryClient } from "@tanstack/react-query";
import { availableQuery } from "@/api/funding";
import { insightsQuery, needsYouQuery } from "@/api/insights";
import { localAsOf } from "@/as-of";

/**
 * Start the reads of Home together. The loader of the Home route calls this function. The parts of Home are in separate
 * boundaries, thus without this a part starts its read only after the parts above it. Spending starts with the report of
 * the default period. A period in the URL starts its own read.
 */
export function startHomeReads(queryClient: QueryClient) {
  const asOf = localAsOf();
  void queryClient.prefetchQuery(availableQuery(asOf));
  void queryClient.prefetchQuery(needsYouQuery(asOf));
  void queryClient.prefetchQuery(insightsQuery(asOf, {}));
}
