import { getRouteApi } from "@tanstack/react-router";
import { useListSearch } from "@/lists/use-list-search";

const route = getRouteApi("/accounts_/$accountId");

export function useAccountActivitySearch() {
  return useListSearch(route.useSearch(), route.useNavigate(), { sort: "date", dir: "desc" });
}
