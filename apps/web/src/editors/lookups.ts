import { useQuery } from "@tanstack/react-query";
import { accountOptionsQuery } from "@/api/accounts";
import { activeBucketsQuery } from "@/api/buckets";
import { categoryOptionsQuery, groupListQuery } from "@/api/categories";
import { merchantOptionsQuery } from "@/api/merchants";
import { activePlansQuery } from "@/api/recurring";
import { reviewSummaryQuery } from "@/api/review";
import { bookCurrencyQuery } from "@/api/settings";
import { tagOptionsQuery } from "@/api/tags";
import { localAsOf } from "@/as-of";

export function useBookCurrency() {
  return useQuery(bookCurrencyQuery());
}

export function useAccounts() {
  return useQuery(accountOptionsQuery());
}

export function useCategories() {
  return useQuery(categoryOptionsQuery());
}

export function useTags() {
  return useQuery(tagOptionsQuery());
}

export function useMerchants() {
  return useQuery(merchantOptionsQuery());
}

export function useGroups() {
  return useQuery(groupListQuery());
}

export function useActiveBuckets() {
  return useQuery(activeBucketsQuery());
}

/** The Needs review total and level counts. The shell and Home share this one query. */
export function useReviewSummary() {
  return useQuery(reviewSummaryQuery(localAsOf()));
}

export function useActivePlans() {
  return useQuery(activePlansQuery());
}
