import type { InsightsSearch } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useDeferredValue, useMemo } from "react";
import { insightsQuery } from "@/api/insights";
import { localAsOf } from "@/as-of";
import { pageQuery } from "@/editors/page-search";

const homeRoute = getRouteApi("/");

/** The period and the selection of Spending on Home in the URL, and the function that changes them. */
export function useInsightsSearch() {
  const urlSearch = homeRoute.useSearch();
  const navigate = homeRoute.useNavigate();
  const search = useMemo(() => pageQuery(urlSearch), [urlSearch]);

  function patchSearch(patch: InsightsSearch) {
    void navigate({ search: (prev) => ({ ...prev, ...patch }) });
  }

  return { search, patchSearch };
}

/**
 * The report for the period and the selection in the URL. Each part of Spending on Home calls this hook.
 * The cards share one read. The report on the screen stays while the report for a new period or a new selection loads.
 */
export function useInsightsReport() {
  const { search: chosen, patchSearch } = useInsightsSearch();
  const search = useDeferredValue(chosen);
  const { data } = useSuspenseQuery(insightsQuery(localAsOf(), search));
  return { data, search, patchSearch };
}
