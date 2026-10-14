import { useQuery } from "@tanstack/react-query";
import { categoryOptionsQuery, groupListQuery, useDeleteGroup } from "@/api/categories";
import { errorCode } from "@/api/client";
import { useEditors } from "@/editors/editor-api";
import { categoryError } from "@/settings/format";
import { SettingsBack } from "@/settings/settings-nav";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { RowMenu } from "@/components/row-menu";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

function countLabel(count: number) {
  return count === 1 ? "1 category" : `${count} categories`;
}

export function GroupsPage() {
  const { openEditor, confirm } = useEditors();
  const groups = useQuery(groupListQuery());
  const categories = useQuery(categoryOptionsQuery());
  const deleteGroup = useDeleteGroup();

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
  for (const category of categories.data ?? []) {
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
          <Button type="button" onClick={() => void openEditor("group", { id: null })}>
            New group
          </Button>
        }
      />
      {deleteGroup.error ? (
        <p role="alert" className="text-sm text-attn">
          {categoryError(errorCode(deleteGroup.error))}
        </p>
      ) : null}
      <ListCard label="Groups">
        {rows.length === 0 ? (
          <p className="px-5 py-5 text-muted-foreground">No groups.</p>
        ) : (
          rows.map((group) => (
            <ListRow key={group.id} simple onOpen={() => void openEditor("group", { id: group.id })}>
              <div className={listName}>
                {group.name}
                <small>{countLabel(counts.get(group.id) ?? 0)}</small>
              </div>
              <RowMenu label={`Actions for ${group.name}`}>
                <DropdownMenuItem
                  className="min-h-11"
                  onSelect={() => {
                    void confirm({
                      title: "Delete this group?",
                      description: `Delete ${group.name}. Categories in this group move to no group.`,
                      confirmLabel: "Delete group",
                    }).then((ok) => {
                      if (ok) {
                        deleteGroup.mutate(group.id);
                      }
                    });
                  }}
                >
                  Delete
                </DropdownMenuItem>
              </RowMenu>
            </ListRow>
          ))
        )}
      </ListCard>
    </>
  );
}
