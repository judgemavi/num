import type { InsightsSearch } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useMemo } from "react";
import { insightsQuery } from "@/api/insights";
import { localAsOf } from "@/as-of";
import { useTags } from "@/editors/lookups";
import { pageQuery } from "@/editors/page-search";

const homeRoute = getRouteApi("/");

/** The period and the selection of Spending on Home in the URL, and the function that changes them. */
export function useSpendingSearch() {
  const urlSearch = homeRoute.useSearch();
  const navigate = homeRoute.useNavigate();
  const tags = useTags();
  const invalidTag = urlSearch.tagId !== undefined && !tags.some((tag) => tag.id === urlSearch.tagId);
  const search = useMemo(() => ({ ...pageQuery(urlSearch), ...(invalidTag ? { tagId: undefined } : {}) }), [urlSearch, invalidTag]);

  useEffect(() => {
    if (invalidTag) {
      void navigate({ search: (prev) => ({ ...prev, tagId: undefined }), replace: true });
    }
  }, [invalidTag, navigate]);

  function patchSearch(patch: InsightsSearch) {
    void navigate({ search: (prev) => ({ ...prev, ...patch }) });
  }

  return { search, patchSearch };
}

/**
 * The report for the period and the selection in the URL. Each part of Spending on Home calls this hook.
 * The cards share one read. The report on the screen stays while the report for a new period or a new selection loads.
 */
export function useSpendingReport() {
  const { search: chosen, patchSearch } = useSpendingSearch();
  const search = useDeferredValue(chosen);
  const { data } = useSuspenseQuery(insightsQuery(localAsOf(), search));
  return { data, search, patchSearch };
}
