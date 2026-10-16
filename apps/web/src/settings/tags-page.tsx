import { RecordListPage, ArchivedSettingsList } from "@/settings/record-list-page";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { tagListQuery, useArchiveTag } from "@/api/tags";
import { ArchiveMenuItem } from "@/components/archive-menu-item";
import { ListRow, listName } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
import { useEditors } from "@/editors/editor-api";
import { ArchivedFilterBar } from "@/lists/archived-filter-bar";
import { nameSortOptions } from "@/lists/list-search";
import { useListSearch } from "@/lists/use-list-search";

const tagsRoute = getRouteApi("/settings/tags");

function useTagsSearch() {
  return useListSearch(tagsRoute.useSearch(), tagsRoute.useNavigate(), { sort: "name", dir: "asc" });
}

export function TagsPage() {
  return <RecordListPage title="Tags" kind="tag"><Tags /></RecordListPage>;
}

function useTagsRows() {
  const list = useTagsSearch();
  const { data } = useSuspenseQuery(tagListQuery(list.shown));
  return { items: data.items, archived: list.shown.archived };
}

function Tags() {
  return <>
    <ArchivedFilterBar useList={useTagsSearch} switchId="filter-archived-tags" sortId="tag-sort" sortOptions={nameSortOptions} />
    <ArchivedSettingsList title="Tags" useRows={useTagsRows}>
      {(tag) => <TagRow key={tag.id} tag={tag} />}
    </ArchivedSettingsList>
  </>;
}

function TagRow({ tag }: { tag: ReturnType<typeof useTagsRows>["items"][number] }) {
  const { openEditor } = useEditors();
  const archive = useArchiveTag();
  return (
            <ListRow
              key={tag.id}
              size="simple"
              label={tag.name}
              onOpen={() => void openEditor("tag", { id: tag.id })}
              menu={
                <RowMenu label={`Actions for ${tag.name}`}>
                  <ArchiveMenuItem
                    archived={tag.archivedAt !== null}
                    noun="tag" name={tag.name}
                    onConfirm={(restore) => archive.mutate({ id: tag.id, restore })}
                  />
                </RowMenu>
              }
            >
              <div className={listName}>{tag.name}</div>
            </ListRow>
  );
}
