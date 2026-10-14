import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { tagListQuery, useArchiveTag } from "@/api/tags";
import { ArchiveMenuItem } from "@/components/archive-menu-item";
import { Boundary } from "@/components/boundary";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { RowMenu } from "@/components/row-menu";
import { Button } from "@/components/ui/button";
import { useEditors } from "@/editors/editor-api";
import { ArchivedFilterBar } from "@/lists/archived-filter-bar";
import { nameSortOptions } from "@/lists/list-search";
import { useListSearch } from "@/lists/use-list-search";
import { SettingsBack } from "@/settings/settings-nav";

const tagsRoute = getRouteApi("/settings/tags");

export function TagsPage() {
  return (
    <Boundary loading="Loading tags." failed="The tags did not load.">
      <Tags />
    </Boundary>
  );
}

function Tags() {
  const list = useListSearch(tagsRoute.useSearch(), tagsRoute.useNavigate(), { sort: "name", dir: "asc" });
  const { openEditor } = useEditors();
  // The list on the screen stays while the list for a new filter or a new sort order loads.
  const { data: tags } = useSuspenseQuery(tagListQuery(list.shown));
  const archive = useArchiveTag();
  const rows = tags.items;

  return (
    <>
      <SettingsBack />
      <PageHeader
        kicker="Settings"
        title="Tags"
        actions={
          <Button type="button" onClick={() => void openEditor("tag", { id: null })}>
            New tag
          </Button>
        }
      />
      <ArchivedFilterBar list={list} switchId="filter-archived-tags" sortId="tag-sort" sortOptions={nameSortOptions} />
      <ListCard label="Tags">
        {rows.length === 0 ? (
          <p className="px-5 py-5 text-muted-foreground">{list.shown.archived ? "No archived tags." : "No tags yet."}</p>
        ) : (
          rows.map((tag) => (
            <ListRow key={tag.id} simple onOpen={() => void openEditor("tag", { id: tag.id })}>
              <div className={listName}>{tag.name}</div>
              <RowMenu label={`Actions for ${tag.name}`}>
                <ArchiveMenuItem
                  archived={tag.archivedAt !== null}
                  question={(restore) => ({
                    title: restore ? "Restore this tag?" : "Archive this tag?",
                    description: restore ? `Restore ${tag.name}. It returns to the active list.` : `Archive ${tag.name}. It leaves the active list.`,
                    confirmLabel: restore ? "Restore tag" : "Archive tag",
                  })}
                  onConfirm={(restore) => archive.mutate({ id: tag.id, restore })}
                />
              </RowMenu>
            </ListRow>
          ))
        )}
      </ListCard>
    </>
  );
}
