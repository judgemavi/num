import { ArchivedFilterBar } from "@/lists/archived-filter-bar";
import { useBucketSearch } from "@/buckets/use-board";

const sortOptions = [
  { sort: "priority", dir: "asc", label: "Priority" },
  { sort: "name", dir: "asc", label: "Name, A to Z" },
  { sort: "name", dir: "desc", label: "Name, Z to A" },
] as const;

export function BucketFilterBar() {
  return <ArchivedFilterBar list={useBucketSearch()} switchId="filter-archived-buckets" sortId="bucket-sort" sortOptions={sortOptions} />;
}
