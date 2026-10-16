import type { InsightsSearch } from "@num/shared";
import type { QueryClient } from "@tanstack/react-query";
import { availableQuery } from "@/api/funding";
import { insightsQuery } from "@/api/insights";
import { needsYouQuery } from "@/api/needs-you";
import { localAsOf } from "@/as-of";

/**
 * Start the reads of Home together. The loader of the Home route calls this function. The parts of Home are in separate
 * boundaries. Spending starts with the period and filters from the URL.
 */
export function startHomeReads(queryClient: QueryClient, search: InsightsSearch) {
  const asOf = localAsOf();
  void queryClient.prefetchQuery(availableQuery(asOf));
  void queryClient.prefetchQuery(needsYouQuery(asOf));
  void queryClient.prefetchQuery(insightsQuery(asOf, search));
}
