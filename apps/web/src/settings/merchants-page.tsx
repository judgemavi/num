import { categoryListSchema, merchantListSchema, merchantSchema, type Merchant, type MerchantListQuery } from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useState } from "react";
import { useEditors } from "@/editors/editor-api";
import { FilterBar } from "@/components/filter-bar";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { RowMenu } from "@/components/row-menu";
import { sortChoice } from "@/components/sort-choice";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/request";
import { merchantError } from "@/settings/format";
import { loadAllPages } from "@/settings/load-all-pages";
import { SettingsBack } from "@/settings/settings-nav";

const merchantsRoute = getRouteApi("/settings/merchants");

const sortOptions = [
  { value: "name:asc", label: "Name, A to Z" },
  { value: "name:desc", label: "Name, Z to A" },
];

function applySort(value: string): Partial<MerchantListQuery> {
  if (value === "name:asc") {
    return { sort: undefined, dir: undefined };
  }
  return { sort: "name", dir: "desc" };
}

export function MerchantsPage() {
  const queryClient = useQueryClient();
  const search = merchantsRoute.useSearch();
  const navigate = merchantsRoute.useNavigate();
  const { openEditor, confirm } = useEditors();
  const [archived, setArchived] = useState(search.archived);
  const [actionError, setActionError] = useState<string | null>(null);

  const merchants = useQuery({
    queryKey: ["merchants", search],
    queryFn: () => loadAllPages("/api/merchants", merchantListSchema, { archived: search.archived, sort: search.sort, dir: search.dir }),
  });
  const categories = useQuery({
    queryKey: ["categories", "merchants"],
    queryFn: () => loadAllPages("/api/categories", categoryListSchema, { archived: false }),
  });

  function changeFilters(patch: Partial<MerchantListQuery>) {
    void navigate({ search: { ...search, ...patch, page: 1 } });
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["merchants"] });
    await queryClient.invalidateQueries({ queryKey: ["suggestion"] });
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    await queryClient.invalidateQueries({ queryKey: ["needs-review"] });
    await queryClient.invalidateQueries({ queryKey: ["hygiene"] });
  }

  async function archiveRow(row: Merchant) {
    const path = row.archivedAt ? "restore" : "archive";
    const result = await apiRequest(`/api/merchants/${row.id}/${path}`, merchantSchema, { method: "POST" });
    if (!result.ok) {
      setActionError(merchantError(result.code));
      return;
    }
    setActionError(null);
    await refresh();
  }

  function askArchive(row: Merchant) {
    const restore = row.archivedAt !== null;
    void confirm({
      title: restore ? "Restore this merchant?" : "Archive this merchant?",
      description: restore ? "It returns to the active list." : "It leaves the active list. You can restore it later.",
      confirmLabel: restore ? "Restore" : "Archive",
    }).then((ok) => {
      if (ok) {
        void archiveRow(row);
      }
    });
  }

  if (merchants.isPending || categories.isPending) {
    return <p className="text-muted-foreground">Loading merchants.</p>;
  }
  if (merchants.isError || categories.isError) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p>Merchants did not load.</p>
        <Button
          type="button"
          onClick={() => {
            void merchants.refetch();
            void categories.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const categoryName = new Map(categories.data.items.map((category) => [category.id, category.name]));

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
      <FilterBar
        activeCount={search.archived ? 1 : 0}
        badges={search.archived ? [{ key: "archived", label: "Archived", onRemove: () => changeFilters({ archived: false }) }] : []}
        onOpenChange={(open) => {
          if (open) {
            setArchived(search.archived);
          }
        }}
        onApply={() => changeFilters({ archived })}
        onClear={() => setArchived(false)}
        onClearAll={() => changeFilters({ archived: false })}
        sort={{
          id: "merchant-sort",
          label: "Sort merchants",
          value: sortChoice(search.sort, search.dir, "name", "asc"),
          options: sortOptions,
          onChange: (value) => changeFilters(applySort(value)),
        }}
        fields={
          <Field orientation="horizontal">
            <Switch id="filter-archived-merchants" checked={archived} onCheckedChange={setArchived} />
            <FieldLabel htmlFor="filter-archived-merchants">Show archived</FieldLabel>
          </Field>
        }
      />
      {actionError ? (
        <p role="alert" className="text-sm text-attn">
          {actionError}
        </p>
      ) : null}
      <ListCard label="Merchants">
        {merchants.data.items.length === 0 ? (
          <p className="px-5 py-5 text-muted-foreground">{search.archived ? "No archived merchants." : "No merchants yet."}</p>
        ) : (
          merchants.data.items.map((merchant) => (
            <ListRow key={merchant.id} simple onOpen={() => void openEditor("merchant", { id: merchant.id })}>
              <div className={listName}>
                {merchant.name}
                {merchant.defaultCategoryId ? <small>{categoryName.get(merchant.defaultCategoryId) ?? "Category"}</small> : null}
              </div>
              <RowMenu label={`Actions for ${merchant.name}`}>
                <DropdownMenuItem className="min-h-11" onSelect={() => void openEditor("mergeMerchant", { merchantId: merchant.id })}>
                  Merge
                </DropdownMenuItem>
                <DropdownMenuItem className="min-h-11" onSelect={() => askArchive(merchant)}>
                  {merchant.archivedAt ? "Restore" : "Archive"}
                </DropdownMenuItem>
              </RowMenu>
            </ListRow>
          ))
        )}
      </ListCard>
    </>
  );
}
