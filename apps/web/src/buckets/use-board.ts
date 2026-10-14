import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { bucketListQuery } from "@/api/buckets";
import { useListSearch } from "@/lists/use-list-search";

const bucketsRoute = getRouteApi("/buckets");

/** The filter and the sort order of the Buckets list in the URL. */
export function useBucketSearch() {
  return useListSearch(bucketsRoute.useSearch(), bucketsRoute.useNavigate(), { sort: "priority", dir: "asc" });
}

/**
 * The buckets for the filter and the sort order in the URL. Each part of the Buckets screen that shows the buckets
 * calls this hook. The parts share one read. The list on the screen stays while the list for a new filter or a new
 * sort order loads.
 */
export function useBucketBoard() {
  const { shown } = useBucketSearch();
  return { shown, board: useSuspenseQuery(bucketListQuery(shown)).data };
}
