import type { InsightsSearch } from "@num/shared";
import type { QueryClient } from "@tanstack/react-query";
import { availableQuery } from "@/api/funding";
import { tagOptionsQuery } from "@/api/tags";
import { insightsQuery } from "@/api/insights";
import { needsYouQuery } from "@/api/needs-you";
import { spendingContent } from "@/home/spending-lazy";
import { localAsOf } from "@/as-of";

/**
 * Start the reads of Home together. The loader of the Home route calls this function. The parts of Home are in separate
 * boundaries. Spending starts with the period and filters from the URL.
 */
export function startHomeReads(queryClient: QueryClient, search: InsightsSearch) {
  void spendingContent.preload().catch(() => undefined);
  const asOf = localAsOf();
  void queryClient.prefetchQuery(availableQuery(asOf));
  void queryClient.prefetchQuery(needsYouQuery(asOf));
  if (search.tagId) {
    void queryClient.fetchQuery(tagOptionsQuery()).then((tags) => {
      const tagId = tags.some((tag) => tag.id === search.tagId) ? search.tagId : undefined;
      return queryClient.prefetchQuery(insightsQuery(asOf, { ...search, tagId }));
    }).catch(() => undefined);
  } else {
    void queryClient.prefetchQuery(tagOptionsQuery());
    void queryClient.prefetchQuery(insightsQuery(asOf, search));
  }
}
