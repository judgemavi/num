import { useAccountSearch } from "@/accounts/use-account-search";
import { useArchivedFilter } from "@/lists/archived-filter";
import { FilterBar } from "@/components/filter-bar";
import { SortSelect } from "@/lists/sort-select";
import { nameSortOptions } from "@/lists/list-search";

export function AccountFilterBar() {
  const list = useAccountSearch();
  const filter = useArchivedFilter(list.search.archived, list.patch, "filter-archived-accounts");
  return (
    <FilterBar
      {...filter}
      sort={
        <SortSelect
          id="account-sort"
          label="Sort accounts"
          value={list.sort}
          options={nameSortOptions}
          onChange={list.setSort}
        />
      }
    />
  );
}
