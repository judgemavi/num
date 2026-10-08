import { tagListSchema, tagSchema, type Tag, type TagListQuery } from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useState } from "react";
import { FilterBar } from "@/components/filter-bar";
import { sortChoice } from "@/components/sort-choice";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { RowMenu } from "@/components/row-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/request";
import { tagError } from "@/settings/format";
import { loadAllPages } from "@/settings/load-all-pages";
import { NameForm } from "@/settings/name-form";
import { SettingsBack } from "@/settings/settings-nav";

const tagsRoute = getRouteApi("/settings/tags");

const sortOptions = [
  { value: "name:asc", label: "Name, A to Z" },
  { value: "name:desc", label: "Name, Z to A" },
];

function applySort(value: string): Partial<TagListQuery> {
  if (value === "name:asc") {
    return { sort: undefined, dir: undefined };
  }
  return { sort: "name", dir: "desc" };
}

export function TagsPage() {
  const queryClient = useQueryClient();
  const search = tagsRoute.useSearch();
  const navigate = tagsRoute.useNavigate();
  const [archived, setArchived] = useState(search.archived);
  const [draft, setDraft] = useState<Tag | "new" | null>(null);
  const [pending, setPending] = useState<Tag | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const tags = useQuery({
    queryKey: ["tags", search],
    queryFn: () => loadAllPages("/api/tags", tagListSchema, { archived: search.archived, sort: search.sort, dir: search.dir }),
  });

  function changeFilters(patch: Partial<TagListQuery>) {
    void navigate({ search: { ...search, ...patch, page: 1 } });
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["tags"] });
  }

  async function saveTag(name: string) {
    const current = draft !== "new" && draft !== null ? draft : null;
    const result = await apiRequest(current ? `/api/tags/${current.id}` : "/api/tags", tagSchema, {
      method: current ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!result.ok) {
      return tagError(result.code);
    }
    setActionError(null);
    await refresh();
    return null;
  }

  async function confirmPending() {
    if (!pending) {
      return;
    }
    const path = pending.archivedAt ? "restore" : "archive";
    const result = await apiRequest(`/api/tags/${pending.id}/${path}`, tagSchema, { method: "POST" });
    if (!result.ok) {
      setActionError(tagError(result.code));
      return;
    }
    setActionError(null);
    setPending(null);
    await refresh();
  }

  if (tags.isPending) {
    return <p className="text-muted-foreground">Loading tags.</p>;
  }
  if (tags.isError) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p>The tags did not load.</p>
        <Button type="button" onClick={() => void tags.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const rows = tags.data?.items ?? [];

  return (
    <>
      <SettingsBack />
      <PageHeader
        kicker="Settings"
        title="Tags"
        actions={
          <Button type="button" onClick={() => setDraft("new")}>
            New tag
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
          id: "tag-sort",
          label: "Sort",
          value: sortChoice(search.sort, search.dir, "name", "asc"),
          options: sortOptions,
          onChange: (value) => changeFilters(applySort(value)),
        }}
        fields={
          <Field orientation="horizontal">
            <Switch id="filter-archived-tags" checked={archived} onCheckedChange={setArchived} />
            <FieldLabel htmlFor="filter-archived-tags">Show archived</FieldLabel>
          </Field>
        }
      />
      {actionError ? (
        <p role="alert" className="text-sm text-attn">
          {actionError}
        </p>
      ) : null}
      <ListCard label="Tags">
        {rows.length === 0 ? (
          <p className="px-5 py-5 text-muted-foreground">{search.archived ? "No archived tags." : "No tags yet."}</p>
        ) : (
          rows.map((tag) => (
            <ListRow key={tag.id} simple onOpen={() => setDraft(tag)}>
              <div className={listName}>{tag.name}</div>
              <RowMenu label={`Actions for ${tag.name}`}>
                <DropdownMenuItem className="min-h-11" onSelect={() => setPending(tag)}>
                  {tag.archivedAt ? "Restore" : "Archive"}
                </DropdownMenuItem>
              </RowMenu>
            </ListRow>
          ))
        )}
      </ListCard>
      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent>
          {draft ? (
            <NameForm
              key={draft === "new" ? "new-tag" : draft.id}
              title={draft === "new" ? "New tag" : "Rename tag"}
              description="Use a tag for a trip or a project."
              label="Name"
              submitLabel={draft === "new" ? "Add tag" : "Save tag"}
              savingLabel="Saving tag"
              initialName={draft === "new" ? "" : draft.name}
              onClose={() => setDraft(null)}
              onSubmit={saveTag}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.archivedAt ? "Restore this tag?" : "Archive this tag?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.archivedAt
                ? `Restore ${pending.name}. It returns to the active list.`
                : `Archive ${pending?.name ?? "this tag"}. It leaves the active list.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmPending()}>
              {pending?.archivedAt ? "Restore tag" : "Archive tag"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
