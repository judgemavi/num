import { useAccountSearch } from "@/accounts/use-account-search";
import { ArchivedFilterBar } from "@/lists/archived-filter-bar";
import { nameSortOptions } from "@/lists/list-search";

export function AccountFilterBar() {
  return <ArchivedFilterBar useList={useAccountSearch} switchId="filter-archived-accounts" sortId="account-sort" sortOptions={nameSortOptions} />;
}
