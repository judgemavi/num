import type { CategoryListQuery } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useState } from "react";
import { categoryListQuery, groupListQuery, useArchiveCategory } from "@/api/categories";
import { errorCode } from "@/api/client";
import { useEditors } from "@/editors/editor-api";
import { FilterBar } from "@/components/filter-bar";
import { sortChoice } from "@/components/sort-choice";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { RowMenu } from "@/components/row-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { categoryError } from "@/settings/format";
import { SettingsBack } from "@/settings/settings-nav";

const categoriesRoute = getRouteApi("/settings/categories");
const anyGroup = "any";

type Draft = { group: string; archived: boolean };

const sortOptions = [
  { value: "name:asc", label: "Name, A to Z" },
  { value: "name:desc", label: "Name, Z to A" },
  { value: "kind:asc", label: "Kind, A to Z" },
  { value: "kind:desc", label: "Kind, Z to A" },
];

function draftFrom(search: CategoryListQuery): Draft {
  return { group: search.groupId ?? anyGroup, archived: search.archived };
}

function groupChoice(group: string): CategoryListQuery["groupId"] {
  if (group === anyGroup) {
    return undefined;
  }
  if (group === "none") {
    return "none";
  }
  return group as CategoryListQuery["groupId"];
}

function applySort(value: string): Partial<CategoryListQuery> {
  if (value === "name:asc") {
    return { sort: undefined, dir: undefined };
  }
  const [column, dir] = value.split(":");
  if ((column !== "name" && column !== "kind") || (dir !== "asc" && dir !== "desc")) {
    return {};
  }
  return { sort: column, dir };
}

export function CategoriesPage() {
  const search = categoriesRoute.useSearch();
  const navigate = categoriesRoute.useNavigate();
  const { openEditor, confirm } = useEditors();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(search));
  const groups = useQuery(groupListQuery());
  const categories = useQuery(
    categoryListQuery({ archived: search.archived, groupId: search.groupId, sort: search.sort, dir: search.dir }),
  );
  const archive = useArchiveCategory();

  function changeFilters(patch: Partial<CategoryListQuery>) {
    void navigate({ search: { ...search, ...patch, page: 1 } });
  }

  if (groups.isPending || categories.isPending) {
    return <p className="text-muted-foreground">Loading categories.</p>;
  }
  if (groups.isError || categories.isError) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p>The categories did not load.</p>
        <Button
          type="button"
          onClick={() => {
            void groups.refetch();
            void categories.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const groupRows = groups.data ?? [];
  const groupName = new Map(groupRows.map((group) => [group.id, group.name]));
  const selectedGroup =
    search.groupId === "none" ? "No group" : search.groupId ? (groupName.get(search.groupId) ?? "Group") : undefined;
  const rows = categories.data?.items ?? [];

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
          ...(selectedGroup ? [{ key: "group", label: `Group: ${selectedGroup}`, onRemove: () => changeFilters({ groupId: undefined }) }] : []),
          ...(search.archived ? [{ key: "archived", label: "Archived", onRemove: () => changeFilters({ archived: false }) }] : []),
        ]}
        onOpenChange={(open) => {
          if (open) {
            setDraft(draftFrom(search));
          }
        }}
        onApply={() => changeFilters({ groupId: groupChoice(draft.group), archived: draft.archived })}
        onClear={() => setDraft({ group: anyGroup, archived: false })}
        onClearAll={() => changeFilters({ groupId: undefined, archived: false })}
        sort={{
          id: "category-sort",
          label: "Sort",
          value: sortChoice(search.sort, search.dir, "name", "asc"),
          options: sortOptions,
          onChange: (value) => changeFilters(applySort(value)),
        }}
        fields={
          <>
            <Field>
              <FieldLabel htmlFor="filter-group">Group</FieldLabel>
              <Select value={draft.group} onValueChange={(group) => setDraft({ ...draft, group })}>
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
                onCheckedChange={(archived) => setDraft({ ...draft, archived })}
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
          <p className="px-5 py-5 text-muted-foreground">{search.archived ? "No archived categories." : "No categories."}</p>
        ) : (
          rows.map((category) => (
            <ListRow key={category.id} simple onOpen={() => void openEditor("category", { id: category.id })}>
              <div className={listName}>
                {category.name}
                <small>{category.groupId ? (groupName.get(category.groupId) ?? "No group") : "No group"}</small>
              </div>
              {category.kind === "expense" && category.essential ? <Badge variant="neutral">Essential</Badge> : null}
              <RowMenu label={`Actions for ${category.name}`}>
                <DropdownMenuItem
                  className="min-h-11"
                  onSelect={() => {
                    const restore = category.archivedAt !== null;
                    void confirm({
                      title: restore ? "Restore this category?" : "Archive this category?",
                      description: restore
                        ? `Restore ${category.name}. It returns to the active list.`
                        : `Archive ${category.name}. It leaves the active list.`,
                      confirmLabel: restore ? "Restore category" : "Archive category",
                    }).then((ok) => {
                      if (ok) {
                        archive.mutate({ id: category.id, restore });
                      }
                    });
                  }}
                >
                  {category.archivedAt ? "Restore" : "Archive"}
                </DropdownMenuItem>
              </RowMenu>
            </ListRow>
          ))
        )}
      </ListCard>
    </>
  );
}
