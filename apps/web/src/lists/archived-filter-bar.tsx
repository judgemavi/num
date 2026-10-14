import { useState } from "react";
import { FilterBar } from "@/components/filter-bar";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import type { SortChoice } from "@/lists/list-search";
import { SortSelect } from "@/lists/sort-select";

type ArchivedFilterBarProps<Column extends string> = {
  /** The result of `useListSearch(...)` for the list. */
  list: {
    search: { archived: boolean };
    sort: SortChoice<Column>;
    patch: (change: { archived: boolean }) => void;
    setSort: (choice: SortChoice<Column>) => void;
  };
  switchId: string;
  sortId: string;
  sortLabel?: string;
  sortOptions: readonly (SortChoice<Column> & { label: string })[];
};

/** The filter bar of a list that has one filter, "Show archived", and a sort control. */
export function ArchivedFilterBar<Column extends string>({ list, switchId, sortId, sortLabel = "Sort", sortOptions }: ArchivedFilterBarProps<Column>) {
  const shown = list.search.archived;
  const [archived, setArchived] = useState(shown);

  return (
    <FilterBar
      activeCount={shown ? 1 : 0}
      badges={shown ? [{ key: "archived", label: "Archived", onRemove: () => list.patch({ archived: false }) }] : []}
      onOpenChange={(open) => {
        if (open) {
          setArchived(shown);
        }
      }}
      onApply={() => list.patch({ archived })}
      onClear={() => setArchived(false)}
      onClearAll={() => list.patch({ archived: false })}
      sort={<SortSelect id={sortId} label={sortLabel} value={list.sort} options={sortOptions} onChange={list.setSort} />}
      fields={
        <Field orientation="horizontal">
          <Switch id={switchId} checked={archived} onCheckedChange={setArchived} />
          <FieldLabel htmlFor={switchId}>Show archived</FieldLabel>
        </Field>
      }
    />
  );
}
