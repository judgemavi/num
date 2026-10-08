import type { BucketListQuery } from "@num/shared";
import { useState } from "react";
import { FilterBar } from "@/components/filter-bar";
import { sortChoice } from "@/components/sort-choice";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

type BucketFilterBarProps = {
  search: BucketListQuery;
  onChange: (patch: Partial<BucketListQuery>) => void;
};

const sortOptions = [
  { value: "priority:asc", label: "Priority" },
  { value: "name:asc", label: "Name, A to Z" },
  { value: "name:desc", label: "Name, Z to A" },
];

function applySort(value: string): Partial<BucketListQuery> {
  if (value === "priority:asc") {
    return { sort: undefined, dir: undefined };
  }
  if (value === "name:asc") {
    return { sort: "name", dir: "asc" };
  }
  return { sort: "name", dir: "desc" };
}

export function BucketFilterBar({ search, onChange }: BucketFilterBarProps) {
  const [archived, setArchived] = useState(search.archived);

  return (
    <FilterBar
      activeCount={search.archived ? 1 : 0}
      badges={search.archived ? [{ key: "archived", label: "Archived", onRemove: () => onChange({ archived: false }) }] : []}
      onOpenChange={(open) => {
        if (open) {
          setArchived(search.archived);
        }
      }}
      onApply={() => onChange({ archived })}
      onClear={() => setArchived(false)}
      onClearAll={() => onChange({ archived: false })}
      sort={{
        id: "bucket-sort",
        label: "Sort",
        value: sortChoice(search.sort, search.dir, "priority", "asc"),
        options: sortOptions,
        onChange: (value) => onChange(applySort(value)),
      }}
      fields={
        <Field orientation="horizontal">
          <Switch id="filter-archived-buckets" checked={archived} onCheckedChange={setArchived} />
          <FieldLabel htmlFor="filter-archived-buckets">Show archived</FieldLabel>
        </Field>
      }
    />
  );
}
