import { useArchivedFilter } from "@/lists/archived-filter";
import { FilterBar } from "@/components/filter-bar";
import { SortSelect } from "@/lists/sort-select";
import { useBucketSearch } from "@/buckets/use-board";

const sortOptions = [
  { sort: "priority", dir: "asc", label: "Priority" },
  { sort: "name", dir: "asc", label: "Name, A to Z" },
  { sort: "name", dir: "desc", label: "Name, Z to A" },
] as const;

export function BucketFilterBar() {
  const list = useBucketSearch();
  const filter = useArchivedFilter(list.search.archived, list.patch, "filter-archived-buckets");
  return (
    <FilterBar
      {...filter}
      sort={
        <SortSelect
          id="bucket-sort"
          label="Sort buckets"
          value={list.sort}
          options={sortOptions}
          onChange={list.setSort}
        />
      }
    />
  );
}
