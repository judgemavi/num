import { getRouteApi } from "@tanstack/react-router";
import { useListSearch } from "@/lists/use-list-search";

const accountsRoute = getRouteApi("/accounts");

/** The filter and the sort order of the Accounts list in the URL. */
export function useAccountSearch() {
  return useListSearch(accountsRoute.useSearch(), accountsRoute.useNavigate(), { sort: "name", dir: "asc" });
}
