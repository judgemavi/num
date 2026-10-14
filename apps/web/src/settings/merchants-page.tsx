import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { merchantListQuery, useArchiveMerchant } from "@/api/merchants";
import { ArchiveMenuItem } from "@/components/archive-menu-item";
import { Boundary } from "@/components/boundary";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { RowMenu } from "@/components/row-menu";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useEditors } from "@/editors/editor-api";
import { ArchivedFilterBar } from "@/lists/archived-filter-bar";
import { nameSortOptions } from "@/lists/list-search";
import { useListSearch } from "@/lists/use-list-search";
import { SettingsBack } from "@/settings/settings-nav";

const merchantsRoute = getRouteApi("/settings/merchants");

export function MerchantsPage() {
  return (
    <Boundary loading="Loading merchants." failed="Merchants did not load.">
      <Merchants />
    </Boundary>
  );
}

function Merchants() {
  const list = useListSearch(merchantsRoute.useSearch(), merchantsRoute.useNavigate(), { sort: "name", dir: "asc" });
  const { openEditor } = useEditors();
  // The list on the screen stays while the list for a new filter or a new sort order loads.
  const { data: merchants } = useSuspenseQuery(merchantListQuery(list.shown));
  const archive = useArchiveMerchant();
  const rows = merchants.items;

  return (
    <>
      <SettingsBack />
      <PageHeader
        kicker="Settings"
        title="Merchants"
        actions={
          <Button type="button" onClick={() => void openEditor("merchant", { id: null })}>
            New merchant
          </Button>
        }
      />
      <ArchivedFilterBar list={list} switchId="filter-archived-merchants" sortId="merchant-sort" sortLabel="Sort merchants" sortOptions={nameSortOptions} />
      <ListCard label="Merchants">
        {rows.length === 0 ? (
          <p className="px-5 py-5 text-muted-foreground">{list.shown.archived ? "No archived merchants." : "No merchants yet."}</p>
        ) : (
          rows.map((merchant) => (
            <ListRow key={merchant.id} simple onOpen={() => void openEditor("merchant", { id: merchant.id })}>
              <div className={listName}>{merchant.name}</div>
              <RowMenu label={`Actions for ${merchant.name}`}>
                <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("mergeMerchant", { merchantId: merchant.id })}>
                  Merge
                </DropdownMenuItem>
                <ArchiveMenuItem
                  archived={merchant.archivedAt !== null}
                  question={(restore) => ({
                    title: restore ? "Restore this merchant?" : "Archive this merchant?",
                    description: restore ? "It returns to the active list." : "It leaves the active list. You can restore it later.",
                    confirmLabel: restore ? "Restore" : "Archive",
                  })}
                  onConfirm={(restore) => archive.mutate({ id: merchant.id, restore })}
                />
              </RowMenu>
            </ListRow>
          ))
        )}
      </ListCard>
    </>
  );
}
