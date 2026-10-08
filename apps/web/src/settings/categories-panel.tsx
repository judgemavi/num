import {
  categoryGroupDeleteSchema,
  categoryGroupListSchema,
  categoryGroupSchema,
  categoryListSchema,
  categorySchema,
  type Category,
  type CategoryGroup,
} from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CategoryForm } from "@/settings/category-form";
import { categoryError, kindLabel } from "@/settings/format";
import { loadAllPages } from "@/settings/load-all-pages";
import { NameForm } from "@/settings/name-form";
import { apiRequest } from "@/request";
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
import { Button } from "@/components/button";
import { ListCard, ListGroup, ListRow } from "@/components/list-card";
import { Pill } from "@/components/pill";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Chip } from "@/components/chip";

type GroupDialog = { kind: "create" } | { kind: "rename"; group: CategoryGroup };
type Confirm = { kind: "archive"; category: Category } | { kind: "delete"; group: CategoryGroup };

export function CategoriesPanel() {
  const queryClient = useQueryClient();
  const [archived, setArchived] = useState(false);
  const [groupDialog, setGroupDialog] = useState<GroupDialog | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<Category | "new" | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
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
    queryKey: ["categories", archived],
    queryFn: () => loadAllPages("/api/categories", categoryListSchema, archived),
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

  async function moveGroup(group: CategoryGroup, direction: -1 | 1) {
    const items = groups.data ?? [];
    const index = items.findIndex((item) => item.id === group.id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= items.length) {
      return;
    }
    const ids = items.map((item) => item.id);
    const [moved] = ids.splice(index, 1);
    if (!moved) {
      return;
    }
    ids.splice(next, 0, moved);
    const result = await apiRequest("/api/category-groups/order", categoryGroupListSchema, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!result.ok) {
      setActionError(categoryError(result.code));
      return;
    }
    setActionError(null);
    await refresh();
  }

  async function restoreCategory(category: Category) {
    const result = await apiRequest(`/api/categories/${category.id}/restore`, categorySchema, { method: "POST" });
    if (!result.ok) {
      setActionError(categoryError(result.code));
      return;
    }
    setActionError(null);
    await refresh();
  }

  async function confirmAction() {
    if (!confirm) {
      return;
    }
    if (confirm.kind === "archive") {
      const result = await apiRequest(`/api/categories/${confirm.category.id}/archive`, categorySchema, {
        method: "POST",
      });
      if (!result.ok) {
        setActionError(categoryError(result.code));
        return;
      }
    } else {
      const result = await apiRequest(`/api/category-groups/${confirm.group.id}`, categoryGroupDeleteSchema, {
        method: "DELETE",
      });
      if (!result.ok) {
        setActionError(categoryError(result.code));
        return;
      }
    }
    setActionError(null);
    setConfirm(null);
    await refresh();
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
  const categoryRows = categories.data?.items ?? [];
  const sections = [
    ...groupRows.map((group) => ({
      id: group.id,
      title: group.name,
      group,
      rows: categoryRows.filter((category) => category.groupId === group.id),
    })),
    {
      id: "none",
      title: "No group",
      group: null,
      rows: categoryRows.filter((category) => category.groupId === null),
    },
  ];

  return (
    <ListCard
      label="Categories"
      title="Categories"
      actions={
        <>
          <Chip pressed={archived} onClick={() => setArchived((value) => !value)}>
            Show archived
          </Chip>
          <Button type="button" variant="outline" onClick={() => setGroupDialog({ kind: "create" })}>
            New group
          </Button>
          <Button type="button" onClick={() => setCategoryDraft("new")}>
            New category
          </Button>
        </>
      }
    >
      {actionError ? (
        <p role="alert" className="alert">
          {actionError}
        </p>
      ) : null}
      {sections.every((section) => section.rows.length === 0 && section.group === null) && groupRows.length === 0 ? (
        <p className="empty">No categories.</p>
      ) : null}
      {sections.map((section, index) => {
        const group = section.group;
        if (!group && section.rows.length === 0) {
          return null;
        }
        return (
          <div key={section.id}>
            <ListGroup
              label={section.title}
              aside={
                group ? (
                  <span className="list-acts">
                    <Button type="button" variant="outline" disabled={index === 0} onClick={() => void moveGroup(group, -1)}>
                      Move up
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={index === groupRows.length - 1}
                      onClick={() => void moveGroup(group, 1)}
                    >
                      Move down
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setGroupDialog({ kind: "rename", group })}>
                      Rename
                    </Button>
                    <Button type="button" variant="destructive" onClick={() => setConfirm({ kind: "delete", group })}>
                      Delete
                    </Button>
                  </span>
                ) : null
              }
            />
            {archived && section.rows.length === 0 ? null : section.rows.length === 0 ? (
              <p className="empty">No categories.</p>
            ) : (
              section.rows.map((category) => (
                <ListRow key={category.id} simple>
                  <div className="list-name">
                    {category.name}
                    {category.archivedAt ? <small>Archived</small> : null}
                  </div>
                  <div className="list-meta">{kindLabel(category.kind)}</div>
                  <div className="list-meta">
                    {category.kind === "expense" && category.essential ? <Pill>Essential</Pill> : "Not essential"}
                  </div>
                  <div className="list-acts">
                    <Button type="button" variant="outline" onClick={() => setCategoryDraft(category)}>
                      Edit
                    </Button>
                    {category.archivedAt ? (
                      <Button type="button" variant="outline" onClick={() => void restoreCategory(category)}>
                        Restore
                      </Button>
                    ) : (
                      <Button type="button" variant="destructive" onClick={() => setConfirm({ kind: "archive", category })}>
                        Archive
                      </Button>
                    )}
                  </div>
                </ListRow>
              ))
            )}
          </div>
        );
      })}
      <Dialog open={groupDialog !== null} onOpenChange={(open) => !open && setGroupDialog(null)}>
        <DialogContent>
          {groupDialog ? (
            <NameForm
              key={groupDialog.kind === "rename" ? groupDialog.group.id : "new-group"}
              title={groupDialog.kind === "rename" ? "Rename group" : "New group"}
              description="A group only organizes categories on this screen."
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
      <Dialog open={categoryDraft !== null} onOpenChange={(open) => !open && setCategoryDraft(null)}>
        <DialogContent className="max-h-[min(40rem,calc(100%-2rem))] overflow-y-auto sm:max-w-md">
          {categoryDraft !== null ? (
            <CategoryForm
              key={categoryDraft === "new" ? "new-category" : categoryDraft.id}
              category={categoryDraft === "new" ? null : categoryDraft}
              groups={groupRows}
              onClose={() => setCategoryDraft(null)}
              onSaved={() => {
                setCategoryDraft(null);
                setActionError(null);
                void refresh();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "delete" ? "Delete this group?" : "Archive this category?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "delete"
                ? `Delete ${confirm.group.name}. Categories in this group move to no group.`
                : `Archive ${confirm?.kind === "archive" ? confirm.category.name : "this category"}. It leaves the active list.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmAction()}>
              {confirm?.kind === "delete" ? "Delete group" : "Archive category"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ListCard>
  );
}
