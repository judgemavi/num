import { tagListSchema, tagSchema, type Tag } from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { tagError } from "@/settings/format";
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

export function TagsPanel() {
  const queryClient = useQueryClient();
  const [archived, setArchived] = useState(false);
  const [draft, setDraft] = useState<Tag | "new" | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Tag | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const tags = useQuery({
    queryKey: ["tags", archived],
    queryFn: () => loadAllPages("/api/tags", tagListSchema, archived),
  });

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

  async function restore(tag: Tag) {
    const result = await apiRequest(`/api/tags/${tag.id}/restore`, tagSchema, { method: "POST" });
    if (!result.ok) {
      setActionError(tagError(result.code));
      return;
    }
    setActionError(null);
    await refresh();
  }

  async function confirmArchive() {
    if (!archiveTarget) {
      return;
    }
    const result = await apiRequest(`/api/tags/${archiveTarget.id}/archive`, tagSchema, { method: "POST" });
    if (!result.ok) {
      setActionError(tagError(result.code));
      return;
    }
    setActionError(null);
    setArchiveTarget(null);
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
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Tags</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Field orientation="horizontal" className="w-auto">
            <Switch id="show-archived-tags" checked={archived} onCheckedChange={(checked) => setArchived(checked === true)} />
            <FieldLabel htmlFor="show-archived-tags">Show archived</FieldLabel>
          </Field>
          <Button type="button" onClick={() => setDraft("new")}>
            New tag
          </Button>
        </div>
      </div>
      {actionError ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>State</TableHead>
            <TableHead className="sr-only">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-muted-foreground">
                {archived ? "No archived tags." : "No tags yet."}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((tag) => (
              <TableRow key={tag.id}>
                <TableCell>{tag.name}</TableCell>
                <TableCell>{tag.archivedAt ? "Archived" : "Active"}</TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="outline" size="sm" onClick={() => setDraft(tag)}>
                    Rename
                  </Button>
                  {tag.archivedAt ? (
                    <Button type="button" variant="outline" size="sm" className="ml-2" onClick={() => void restore(tag)}>
                      Restore
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="ml-2"
                      onClick={() => setArchiveTarget(tag)}
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
      <AlertDialog open={archiveTarget !== null} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this tag?</AlertDialogTitle>
            <AlertDialogDescription>
              Archive {archiveTarget?.name ?? "this tag"}. It leaves the active list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmArchive()}>
              Archive tag
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
