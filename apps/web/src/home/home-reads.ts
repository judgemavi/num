import type { InsightsSearch } from "@num/shared";
import type { QueryClient } from "@tanstack/react-query";
import { bankStatusesQuery } from "@/api/bank-balances";
import { overspentQuery } from "@/api/buckets";
import { fundingOwedQuery, fundingPositionQuery } from "@/api/funding";
import { hygieneQuery, insightsQuery } from "@/api/insights";
import { forecastQuery, monthPlanQuery } from "@/api/plan";
import { recurringSignalsQuery } from "@/api/recurring";
import { reviewSummaryQuery } from "@/api/review";
import { localAsOf } from "@/as-of";

/** Home shows the insights of this month. */
export const homeInsights: InsightsSearch = { window: "1" };

/**
 * Start all reads of Home together. The loader of the Home route calls this function.
 * The cards of Home are in separate boundaries, thus without this a card starts its read only after the cards above it.
 */
export function startHomeReads(queryClient: QueryClient) {
  const asOf = localAsOf();
  void queryClient.prefetchQuery(forecastQuery(asOf));
  void queryClient.prefetchQuery(monthPlanQuery(asOf));
  void queryClient.prefetchQuery(hygieneQuery(asOf));
  void queryClient.prefetchQuery(reviewSummaryQuery(asOf));
  void queryClient.prefetchQuery(recurringSignalsQuery(asOf));
  void queryClient.prefetchQuery(overspentQuery());
  void queryClient.prefetchQuery(fundingPositionQuery(asOf));
  void queryClient.prefetchQuery(fundingOwedQuery(asOf));
  void queryClient.prefetchQuery(bankStatusesQuery());
  void queryClient.prefetchQuery(insightsQuery(asOf, homeInsights));
}
