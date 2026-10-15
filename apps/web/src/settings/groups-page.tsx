import { Plus } from "lucide-react";
import { useDeleteGroup } from "@/api/categories";
import { Boundary } from "@/components/boundary";
import { useEditors } from "@/editors/editor-api";
import { useCategories, useGroups } from "@/editors/lookups";
import { SettingsBack } from "@/settings/settings-nav";
import { ListCard, ListEmpty, ListRow, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { RowMenu } from "@/components/row-menu";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

function countLabel(count: number) {
  return count === 1 ? "1 category" : `${count} categories`;
}

export function GroupsPage() {
  return (
    <Boundary loading="Loading groups." failed="The groups did not load.">
      <Groups />
    </Boundary>
  );
}

function Groups() {
  const { openEditor, confirm } = useEditors();
  const rows = useGroups();
  const categories = useCategories();
  const deleteGroup = useDeleteGroup();

  const counts = new Map<string, number>();
  for (const category of categories) {
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
            <Plus size={20} strokeWidth={1.8} aria-hidden="true" />
            New
          </Button>
        }
      />
      <ListCard label="Groups">
        {rows.length === 0 ? (
          <ListEmpty>No groups.</ListEmpty>
        ) : (
          rows.map((group) => (
            <ListRow key={group.id} size="simple" label={group.name} onOpen={() => void openEditor("group", { id: group.id })}>
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
                      confirmLabel: "Delete",
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
