import { getRouteApi } from "@tanstack/react-router";
import { useListSearch } from "@/lists/use-list-search";

const importsRoute = getRouteApi("/accounts_/imports");

/** The filters, the sort order and the page of the Imports list in the URL. */
export function useImportSearch() {
  return useListSearch(importsRoute.useSearch(), importsRoute.useNavigate(), { sort: "date", dir: "desc" });
}
