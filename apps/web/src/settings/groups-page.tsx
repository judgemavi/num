import { categoryGroupDeleteSchema, categoryGroupListSchema, categoryGroupSchema, categoryListSchema, type CategoryGroup } from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { categoryError } from "@/settings/format";
import { loadAllPages } from "@/settings/load-all-pages";
import { NameForm } from "@/settings/name-form";
import { SettingsBack } from "@/settings/settings-nav";
import { apiRequest } from "@/request";
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

type GroupDialog = { kind: "create" } | { kind: "rename"; group: CategoryGroup };

function countLabel(count: number) {
  return count === 1 ? "1 category" : `${count} categories`;
}

export function GroupsPage() {
  const queryClient = useQueryClient();
  const [groupDialog, setGroupDialog] = useState<GroupDialog | null>(null);
  const [confirm, setConfirm] = useState<CategoryGroup | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const groups = useQuery({
    queryKey: ["category-groups"],
    queryFn: async () => {
      const result = await apiRequest("/api/category-groups", categoryGroupListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.items;
    },
  });

  const categories = useQuery({
    queryKey: ["categories", "counts"],
    queryFn: async () => {
      const active = await loadAllPages("/api/categories", categoryListSchema, { archived: false });
      const archived = await loadAllPages("/api/categories", categoryListSchema, { archived: true });
      return { items: [...active.items, ...archived.items] };
    },
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["category-groups"] });
    await queryClient.invalidateQueries({ queryKey: ["categories"] });
  }

  async function saveGroup(name: string) {
    const renaming = groupDialog?.kind === "rename" ? groupDialog.group : null;
    const result = await apiRequest(renaming ? `/api/category-groups/${renaming.id}` : "/api/category-groups", categoryGroupSchema, {
      method: renaming ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!result.ok) {
      return categoryError(result.code);
    }
    setActionError(null);
    await refresh();
    return null;
  }

  async function deleteGroup() {
    if (!confirm) {
      return;
    }
    const result = await apiRequest(`/api/category-groups/${confirm.id}`, categoryGroupDeleteSchema, { method: "DELETE" });
    if (!result.ok) {
      setActionError(categoryError(result.code));
      return;
    }
    setActionError(null);
    setConfirm(null);
    await refresh();
  }

  if (groups.isPending || categories.isPending) {
    return <p className="text-muted-foreground">Loading groups.</p>;
  }
  if (groups.isError || categories.isError) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p>The groups did not load.</p>
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

  const rows = groups.data ?? [];
  const counts = new Map<string, number>();
  for (const category of categories.data?.items ?? []) {
    if (!category.groupId) {
      continue;
    }
    counts.set(category.groupId, (counts.get(category.groupId) ?? 0) + 1);
  }

  return (
    <>
      <SettingsBack />
      <PageHeader
        kicker="Settings"
        title="Groups"
        actions={
          <Button type="button" onClick={() => setGroupDialog({ kind: "create" })}>
            New group
          </Button>
        }
      />
      {actionError ? (
        <p role="alert" className="text-sm text-attn">
          {actionError}
        </p>
      ) : null}
      <ListCard label="Groups">
        {rows.length === 0 ? (
          <p className="px-5 py-5 text-muted-foreground">No groups.</p>
        ) : (
          rows.map((group) => (
            <ListRow key={group.id} simple onOpen={() => setGroupDialog({ kind: "rename", group })}>
              <div className={listName}>
                {group.name}
                <small>{countLabel(counts.get(group.id) ?? 0)}</small>
              </div>
              <RowMenu label={`Actions for ${group.name}`}>
                <DropdownMenuItem className="min-h-11" onSelect={() => setConfirm(group)}>
                  Delete
                </DropdownMenuItem>
              </RowMenu>
            </ListRow>
          ))
        )}
      </ListCard>
      <Dialog open={groupDialog !== null} onOpenChange={(open) => !open && setGroupDialog(null)}>
        <DialogContent>
          {groupDialog ? (
            <NameForm
              key={groupDialog.kind === "rename" ? groupDialog.group.id : "new-group"}
              title={groupDialog.kind === "rename" ? "Rename group" : "New group"}
              description="A group only organizes categories."
              label="Name"
              submitLabel={groupDialog.kind === "rename" ? "Save group" : "Add group"}
              savingLabel="Saving group"
              initialName={groupDialog.kind === "rename" ? groupDialog.group.name : ""}
              onClose={() => setGroupDialog(null)}
              onSubmit={saveGroup}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this group?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm ? `Delete ${confirm.name}. Categories in this group move to no group.` : "Categories in this group move to no group."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void deleteGroup()}>Delete group</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
