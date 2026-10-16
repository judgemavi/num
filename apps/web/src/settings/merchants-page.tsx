import { RecordListPage, ArchivedSettingsList } from "@/settings/record-list-page";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { merchantListQuery, useArchiveMerchant } from "@/api/merchants";
import { ArchiveMenuItem } from "@/components/archive-menu-item";
import { ListRow, listName } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useEditors } from "@/editors/editor-api";
import { ArchivedFilterBar } from "@/lists/archived-filter-bar";
import { nameSortOptions } from "@/lists/list-search";
import { useListSearch } from "@/lists/use-list-search";

const merchantsRoute = getRouteApi("/settings/merchants");

function useMerchantsSearch() {
  return useListSearch(merchantsRoute.useSearch(), merchantsRoute.useNavigate(), { sort: "name", dir: "asc" });
}

export function MerchantsPage() {
  return <RecordListPage title="Merchants" kind="merchant"><Merchants /></RecordListPage>;
}

function useMerchantsRows() {
  const list = useMerchantsSearch();
  const { data } = useSuspenseQuery(merchantListQuery(list.shown));
  return { items: data.items, archived: list.shown.archived };
}

function Merchants() {
  return <>
    <ArchivedFilterBar useList={useMerchantsSearch} switchId="filter-archived-merchants" sortId="merchant-sort" sortOptions={nameSortOptions} />
    <ArchivedSettingsList title="Merchants" useRows={useMerchantsRows}>
      {(merchant) => <MerchantRow key={merchant.id} merchant={merchant} />}
    </ArchivedSettingsList>
  </>;
}

function MerchantRow({ merchant }: { merchant: ReturnType<typeof useMerchantsRows>["items"][number] }) {
  const { openEditor } = useEditors();
  const archive = useArchiveMerchant();
  return (
            <ListRow
              key={merchant.id}
              size="simple"
              label={merchant.name}
              onOpen={() => void openEditor("merchant", { id: merchant.id })}
              menu={
                <RowMenu label={`Actions for ${merchant.name}`}>
                  <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("mergeMerchant", { merchantId: merchant.id })}>
                    Merge
                  </DropdownMenuItem>
                  <ArchiveMenuItem
                    archived={merchant.archivedAt !== null}
                    noun="merchant" name={merchant.name}
                    onConfirm={(restore) => archive.mutate({ id: merchant.id, restore })}
                  />
                </RowMenu>
              }
            >
              <div className={listName}>{merchant.name}</div>
            </ListRow>
  );
}
