import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { categoryListQuery, useArchiveCategory } from "@/api/categories";
import { errorCode } from "@/api/client";
import { useEditors } from "@/editors/editor-api";
import { useGroupNames, useGroups } from "@/editors/lookups";
import { ArchiveMenuItem } from "@/components/archive-menu-item";
import { Boundary } from "@/components/boundary";
import { FilterBar } from "@/components/filter-bar";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { RowMenu } from "@/components/row-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SortSelect } from "@/lists/sort-select";
import { useFilterDraft, useListSearch } from "@/lists/use-list-search";
import { categoryError } from "@/settings/format";
import { SettingsBack } from "@/settings/settings-nav";

const categoriesRoute = getRouteApi("/settings/categories");
const anyGroup = "any";

const sortOptions = [
  { sort: "name", dir: "asc", label: "Name, A to Z" },
  { sort: "name", dir: "desc", label: "Name, Z to A" },
  { sort: "kind", dir: "asc", label: "Kind, A to Z" },
  { sort: "kind", dir: "desc", label: "Kind, Z to A" },
] as const;

/** The filters of the panel with no choice. */
const noFilters = { groupId: undefined, archived: false };

export function CategoriesPage() {
  return (
    <Boundary loading="Loading categories." failed="The categories did not load.">
      <Categories />
    </Boundary>
  );
}

function Categories() {
  const { search, shown, sort, patch, setSort } = useListSearch(categoriesRoute.useSearch(), categoriesRoute.useNavigate(), { sort: "name", dir: "asc" });
  const { openEditor } = useEditors();
  const { draft, changes, change, reset } = useFilterDraft(search);
  const groupRows = useGroups();
  const groupName = useGroupNames();
  // The list on the screen stays while the list for a new filter or a new sort order loads.
  const { data: categories } = useSuspenseQuery(categoryListQuery(shown));
  const archive = useArchiveCategory();

  const selectedGroup =
    search.groupId === "none" ? "No group" : search.groupId ? (groupName.get(search.groupId) ?? "Group") : undefined;
  const rows = categories.items;

  return (
    <>
      <SettingsBack />
      <PageHeader
        kicker="Settings"
        title="Categories"
        actions={
          <Button type="button" onClick={() => void openEditor("category", { id: null })}>
            New category
          </Button>
        }
      />
      <FilterBar
        activeCount={(search.groupId ? 1 : 0) + (search.archived ? 1 : 0)}
        badges={[
          ...(selectedGroup ? [{ key: "group", label: `Group: ${selectedGroup}`, onRemove: () => patch({ groupId: undefined }) }] : []),
          ...(search.archived ? [{ key: "archived", label: "Archived", onRemove: () => patch({ archived: false }) }] : []),
        ]}
        onOpenChange={(open) => {
          if (open) {
            reset();
          }
        }}
        onApply={() => patch(changes)}
        onClear={() => change(noFilters)}
        onClearAll={() => patch(noFilters)}
        sort={<SortSelect id="category-sort" label="Sort" value={sort} options={sortOptions} onChange={setSort} />}
        fields={
          <>
            <Field>
              <FieldLabel htmlFor="filter-group">Group</FieldLabel>
              <Select value={draft.groupId ?? anyGroup} onValueChange={(group) => change({ groupId: group === anyGroup ? undefined : group })}>
                <SelectTrigger id="filter-group" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={anyGroup} className="min-h-11">
                    Any group
                  </SelectItem>
                  <SelectItem value="none" className="min-h-11">
                    No group
                  </SelectItem>
                  {groupRows.map((group) => (
                    <SelectItem key={group.id} value={group.id} className="min-h-11">
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field orientation="horizontal">
              <Switch
                id="filter-archived-categories"
                checked={draft.archived}
                onCheckedChange={(archived) => change({ archived })}
              />
              <FieldLabel htmlFor="filter-archived-categories">Show archived</FieldLabel>
            </Field>
          </>
        }
      />
      {archive.error ? (
        <p role="alert" className="text-sm text-attn">
          {categoryError(errorCode(archive.error))}
        </p>
      ) : null}
      <ListCard label="Categories">
        {rows.length === 0 ? (
          <p className="px-5 py-5 text-muted-foreground">{shown.archived ? "No archived categories." : "No categories."}</p>
        ) : (
          rows.map((category) => (
            <ListRow key={category.id} simple onOpen={() => void openEditor("category", { id: category.id })}>
              <div className={listName}>
                {category.name}
                <small>{category.groupId ? (groupName.get(category.groupId) ?? "No group") : "No group"}</small>
              </div>
              {category.kind === "expense" && category.essential ? <Badge variant="neutral">Essential</Badge> : null}
              <RowMenu label={`Actions for ${category.name}`}>
                <ArchiveMenuItem
                  archived={category.archivedAt !== null}
                  question={(restore) => ({
                    title: restore ? "Restore this category?" : "Archive this category?",
                    description: restore ? `Restore ${category.name}. It returns to the active list.` : `Archive ${category.name}. It leaves the active list.`,
                    confirmLabel: restore ? "Restore category" : "Archive category",
                  })}
                  onConfirm={(restore) => archive.mutate({ id: category.id, restore })}
                />
              </RowMenu>
            </ListRow>
          ))
        )}
      </ListCard>
    </>
  );
}
