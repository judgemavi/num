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
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { ListCard, ListRow } from "@/components/list-card";
import { Pill } from "@/components/pill";
import { Dialog, DialogContent } from "@/components/ui/dialog";

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
    <ListCard
      label="Tags"
      title="Tags"
      actions={
        <>
          <Chip pressed={archived} onClick={() => setArchived((value) => !value)}>
            Show archived
          </Chip>
          <Button type="button" onClick={() => setDraft("new")}>
            New tag
          </Button>
        </>
      }
    >
      {actionError ? (
        <p role="alert" className="alert">
          {actionError}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="empty">{archived ? "No archived tags." : "No tags yet."}</p>
      ) : (
        rows.map((tag) => (
          <ListRow key={tag.id} simple>
            <div className="list-name">{tag.name}</div>
            <div className="list-meta">{tag.archivedAt ? <Pill tone="attention">Archived</Pill> : "Active"}</div>
            <div className="list-acts">
              <Button type="button" variant="outline" onClick={() => setDraft(tag)}>
                Rename
              </Button>
              {tag.archivedAt ? (
                <Button type="button" variant="outline" onClick={() => void restore(tag)}>
                  Restore
                </Button>
              ) : (
                <Button type="button" variant="destructive" onClick={() => setArchiveTarget(tag)}>
                  Archive
                </Button>
              )}
            </div>
          </ListRow>
        ))
      )}
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
    </ListCard>
  );
}
