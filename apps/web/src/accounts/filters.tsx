import type { AccountListQuery } from "@num/shared";
import { useState } from "react";
import { FilterBar } from "@/components/filter-bar";
import { sortChoice } from "@/components/sort-choice";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

type AccountFilterBarProps = {
  search: AccountListQuery;
  onChange: (patch: Partial<AccountListQuery>) => void;
};

const sortOptions = [
  { value: "name:asc", label: "Name, A to Z" },
  { value: "name:desc", label: "Name, Z to A" },
];

function applySort(value: string): Partial<AccountListQuery> {
  if (value === "name:asc") {
    return { sort: undefined, dir: undefined };
  }
  return { sort: "name", dir: "desc" };
}

export function AccountFilterBar({ search, onChange }: AccountFilterBarProps) {
  const [archived, setArchived] = useState(search.archived);

  return (
    <FilterBar
      activeCount={search.archived ? 1 : 0}
      badges={
        search.archived
          ? [{ key: "archived", label: "Archived", onRemove: () => onChange({ archived: false }) }]
          : []
      }
      onOpenChange={(open) => {
        if (open) {
          setArchived(search.archived);
        }
      }}
      onApply={() => onChange({ archived })}
      onClear={() => setArchived(false)}
      onClearAll={() => onChange({ archived: false })}
      sort={{
        id: "account-sort",
        label: "Sort",
        value: sortChoice(search.sort, search.dir, "name", "asc"),
        options: sortOptions,
        onChange: (value) => onChange(applySort(value)),
      }}
      fields={
        <Field orientation="horizontal">
          <Switch id="filter-archived-accounts" checked={archived} onCheckedChange={setArchived} />
          <FieldLabel htmlFor="filter-archived-accounts">Show archived</FieldLabel>
        </Field>
      }
    />
  );
}
