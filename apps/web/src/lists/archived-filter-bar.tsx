import { FilterBar } from "@/components/filter-bar";
import { useAppForm } from "@/forms/form-hook";
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
  // The panel keeps the change of the person until the person applies it.
  const panel = useAppForm({
    defaultValues: { archived: shown },
    onSubmit: ({ value }) => list.patch(value),
  });

  return (
    <FilterBar
      activeCount={shown ? 1 : 0}
      badges={shown ? [{ key: "archived", label: "Archived", onRemove: () => list.patch({ archived: false }) }] : []}
      onOpenChange={(open) => {
        if (open) {
          panel.reset();
        }
      }}
      onApply={() => void panel.handleSubmit()}
      onClear={() => panel.reset({ archived: false }, { keepDefaultValues: true })}
      onClearAll={() => list.patch({ archived: false })}
      sort={<SortSelect id={sortId} label={sortLabel} value={list.sort} options={sortOptions} onChange={list.setSort} />}
      fields={<panel.AppField name="archived">{(field) => <field.SwitchField id={switchId} label="Show archived" />}</panel.AppField>}
    />
  );
}
