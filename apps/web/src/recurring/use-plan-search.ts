import { getRouteApi } from "@tanstack/react-router";
import { useListSearch } from "@/lists/use-list-search";

const recurringRoute = getRouteApi("/recurring");

/** The filters and the sort order of the Recurring list in the URL. */
export function usePlanSearch() {
  return useListSearch(recurringRoute.useSearch(), recurringRoute.useNavigate(), { sort: "name", dir: "asc" });
}
