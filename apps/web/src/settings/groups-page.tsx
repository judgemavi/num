import { categoryGroupDeleteSchema, categoryGroupListSchema, categoryListSchema, type CategoryGroup } from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useEditors } from "@/editors/editor-host";
import { categoryError } from "@/settings/format";
import { loadAllPages } from "@/settings/load-all-pages";
import { SettingsBack } from "@/settings/settings-nav";
import { apiRequest } from "@/request";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { RowMenu } from "@/components/row-menu";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

function countLabel(count: number) {
  return count === 1 ? "1 category" : `${count} categories`;
}

export function GroupsPage() {
  const queryClient = useQueryClient();
  const { openEditor, confirm } = useEditors();
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

  async function deleteGroup(group: CategoryGroup) {
    const result = await apiRequest(`/api/category-groups/${group.id}`, categoryGroupDeleteSchema, { method: "DELETE" });
    if (!result.ok) {
      setActionError(categoryError(result.code));
      return;
    }
    setActionError(null);
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
          <Button type="button" onClick={() => void openEditor("group", { id: null })}>
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
                        void deleteGroup(group);
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
