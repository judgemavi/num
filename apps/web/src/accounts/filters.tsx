import { useAccountSearch } from "@/accounts/use-account-search";
import { ArchivedFilterBar } from "@/lists/archived-filter-bar";
import { nameSortOptions } from "@/lists/list-search";

export function AccountFilterBar() {
  return <ArchivedFilterBar list={useAccountSearch()} switchId="filter-archived-accounts" sortId="account-sort" sortOptions={nameSortOptions} />;
}
