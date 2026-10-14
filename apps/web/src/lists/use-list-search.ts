import { useCallback, useDeferredValue, useEffect, useMemo } from "react";
import { pageQuery } from "@/editors/page-search";
import { columnSort, lastPageOf, sortOf, sortParams, type SortChoice } from "@/lists/list-search";

/**
 * The list query in the URL of a route, and the functions that change it (decision 0004). Give it the search and the
 * `navigate` function of the route (`getRouteApi(...)`), and the default sort order of the list.
 * - `search` is the list query in the URL. The filter bar shows it at once.
 * - `shown` is the list query of the rows on the screen. Read the list with it, thus the rows stay while new rows load.
 * - `settled` is true when the rows on the screen are for the URL.
 * - `patch` changes filters and sets the page to 1.
 * - `sort` is the sort order of the list. `setSort` and `sortBy` change it and set the page to 1.
 * - `setPage` changes only the page.
 */
export function useListSearch<Column extends string, Search extends { page: number; dir?: SortChoice<Column>["dir"]; edit?: string }>(
  url: Search & { sort?: Column },
  navigate: (options: { search: (prev: NoInfer<Search>) => NoInfer<Search>; replace?: boolean }) => Promise<void>,
  fallback: SortChoice<NoInfer<Column>>,
) {
  const search = useMemo(() => pageQuery(url), [url]);
  const shown = useDeferredValue(search);
  const sort = sortOf(url, fallback);

  // The function is stable: `useLastPage` uses it in an effect.
  const setPage = useCallback(
    (page: number, options?: { replace: boolean }) => {
      void navigate({ search: (prev) => ({ ...prev, page }), replace: options?.replace });
    },
    [navigate],
  );

  function patch(change: Partial<typeof search>) {
    void navigate({ search: (prev) => ({ ...prev, ...change, page: 1 }) });
  }

  function setSort(choice: SortChoice<Column>) {
    void navigate({ search: (prev) => ({ ...prev, ...sortParams(choice, fallback), page: 1 }) });
  }

  return {
    search,
    shown,
    settled: search === shown,
    sort,
    patch,
    setSort,
    /** Sort by a column header. */
    sortBy: (column: Column) => setSort(columnSort(sort, column, fallback)),
    setPage,
  };
}

/**
 * The number of the last page of a list. When the page in the URL is after the last page, the URL changes to the last
 * page (decision 0004). The change waits until the rows on the screen are for the URL.
 */
export function useLastPage(
  list: { settled: boolean; search: { page: number }; setPage: (page: number, options: { replace: boolean }) => void },
  rows: { total: number; pageSize: number },
) {
  const lastPage = lastPageOf(rows.total, rows.pageSize);
  const { settled, setPage } = list;
  const page = list.search.page;
  // The URL is outside React, and the last page is known only after the API answers. Thus this is an effect.
  useEffect(() => {
    if (settled && page > lastPage) {
      setPage(lastPage, { replace: true });
    }
  }, [settled, page, lastPage, setPage]);
  return lastPage;
}
