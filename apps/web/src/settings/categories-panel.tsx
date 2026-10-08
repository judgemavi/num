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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Categories</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Field orientation="horizontal" className="w-auto">
            <Switch id="show-archived-categories" checked={archived} onCheckedChange={(checked) => setArchived(checked === true)} />
            <FieldLabel htmlFor="show-archived-categories">Show archived</FieldLabel>
          </Field>
          <Button type="button" variant="outline" onClick={() => setGroupDialog({ kind: "create" })}>
            New group
          </Button>
          <Button type="button" onClick={() => setCategoryDraft("new")}>
            New category
          </Button>
        </div>
      </div>
      {actionError ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}
      {sections.map((section, index) => {
        const group = section.group;
        if (!group && section.rows.length === 0) {
          return null;
        }
        return (
        <div key={section.id} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">{section.title}</h3>
            {group ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={index === 0} onClick={() => void moveGroup(group, -1)}>
                  Move up
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={index === groupRows.length - 1}
                  onClick={() => void moveGroup(group, 1)}
                >
                  Move down
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setGroupDialog({ kind: "rename", group })}>
                  Rename
                </Button>
                <Button type="button" variant="destructive" size="sm" onClick={() => setConfirm({ kind: "delete", group })}>
                  Delete
                </Button>
              </div>
            ) : null}
          </div>
          {archived && section.rows.length === 0 ? null : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Essential</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="sr-only">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {section.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No categories.
                  </TableCell>
                </TableRow>
              ) : (
                section.rows.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell>{category.name}</TableCell>
                    <TableCell>{kindLabel(category.kind)}</TableCell>
                    <TableCell>{category.kind === "expense" && category.essential ? "Yes" : "No"}</TableCell>
                    <TableCell>{category.archivedAt ? "Archived" : "Active"}</TableCell>
                    <TableCell className="text-right">
                      <Button type="button" variant="outline" size="sm" onClick={() => setCategoryDraft(category)}>
                        Edit
                      </Button>
                      {category.archivedAt ? null : (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="ml-2"
                          onClick={() => setConfirm({ kind: "archive", category })}
                        >
                          Archive
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
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
                ? `Delete ${confirm.group.name}. You can delete a group only when it has no categories.`
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
    </section>
  );
}
