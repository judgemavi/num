import { RecordListPage, SettingsRows } from "@/settings/record-list-page";
import { useDeleteGroup } from "@/api/categories";
import { useEditors } from "@/editors/editor-api";
import { useCategories, useGroups } from "@/editors/lookups";
import { ListEmpty, ListRow, listName } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

function countLabel(count: number) {
  return count === 1 ? "1 category" : `${count} categories`;
}

export function GroupsPage() {
  return (
    <RecordListPage title="Groups" kind="group">
      <Groups />
    </RecordListPage>
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
      <SettingsRows title="Groups">
        {rows.length === 0 ? (
          <ListEmpty>No groups.</ListEmpty>
        ) : (
          rows.map((group) => (
            <ListRow
              key={group.id}
              size="simple"
              label={group.name}
              onOpen={() => void openEditor("group", { id: group.id })}
              menu={
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
              }
            >
              <div className={listName}>
                {group.name}
                <small>{countLabel(counts.get(group.id) ?? 0)}</small>
              </div>
            </ListRow>
          ))
        )}
      </SettingsRows>
    </>
  );
}
