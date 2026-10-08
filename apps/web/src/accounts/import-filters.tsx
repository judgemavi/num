import type { Account, ImportViewQuery, ImportViewStatus } from "@num/shared";
import { useState } from "react";
import { FilterBar, type FilterBadge } from "@/components/filter-bar";
import { sortChoice } from "@/components/sort-choice";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { importStatusLabel } from "@/accounts/import-format";
import { formatDate } from "@/transactions/format";
import { OptionCombobox } from "@/transactions/option-combobox";

type ImportFilterBarProps = {
  search: ImportViewQuery;
  accounts: Account[];
  onChange: (patch: Partial<ImportViewQuery>) => void;
};

type Draft = {
  accountId?: string;
  status?: ImportViewStatus;
  from?: string;
  to?: string;
};

const anyStatus = "any";

const sortOptions = [
  { value: "date:desc", label: "Date, newest" },
  { value: "date:asc", label: "Date, oldest" },
];

function draftFrom(search: ImportViewQuery): Draft {
  return {
    accountId: search.accountId,
    status: search.status,
    from: search.from,
    to: search.to,
  };
}

function applySort(value: string): Partial<ImportViewQuery> {
  if (value === "date:desc") {
    return { sort: undefined, dir: undefined };
  }
  return { sort: "date", dir: "asc" };
}

export function ImportFilterBar({ search, accounts, onChange }: ImportFilterBarProps) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(search));
  const accountName = accounts.find((account) => account.id === search.accountId)?.name;

  const badges: FilterBadge[] = [];
  if (search.accountId && accountName) {
    badges.push({
      key: "account",
      label: `Account: ${accountName}`,
      onRemove: () => onChange({ accountId: undefined }),
    });
  }
  if (search.status) {
    badges.push({
      key: "status",
      label: `Status: ${importStatusLabel(search.status)}`,
      onRemove: () => onChange({ status: undefined }),
    });
  }
  if (search.from) {
    badges.push({ key: "from", label: `From: ${formatDate(search.from)}`, onRemove: () => onChange({ from: undefined }) });
  }
  if (search.to) {
    badges.push({ key: "to", label: `To: ${formatDate(search.to)}`, onRemove: () => onChange({ to: undefined }) });
  }

  return (
    <FilterBar
      activeCount={badges.length}
      badges={badges}
      onOpenChange={(open) => {
        if (open) {
          setDraft(draftFrom(search));
        }
      }}
      onApply={() => onChange(draft)}
      onClear={() => setDraft({})}
      onClearAll={() => onChange({ accountId: undefined, status: undefined, from: undefined, to: undefined })}
      sort={{
        id: "import-sort",
        label: "Sort",
        value: sortChoice(search.sort, search.dir, "date", "desc"),
        options: sortOptions,
        onChange: (value) => onChange(applySort(value)),
      }}
      fields={
        <>
          <Field>
            <FieldLabel htmlFor="import-filter-account">Account</FieldLabel>
            <OptionCombobox
              id="import-filter-account"
              value={draft.accountId ?? null}
              options={accounts.map((account) => ({ id: account.id, label: account.name }))}
              placeholder="Any account"
              emptyLabel="Any account"
              onChange={(accountId) => setDraft({ ...draft, accountId: accountId ?? undefined })}
            />
          </Field>
          <Field>
            <FieldLabel>Status</FieldLabel>
            <Select
              value={draft.status ?? anyStatus}
              onValueChange={(value) =>
                setDraft({
                  ...draft,
                  status: value === "imported" || value === "undone" || value === "needs_you" ? value : undefined,
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={anyStatus}>Any status</SelectItem>
                <SelectItem value="imported">Imported</SelectItem>
                <SelectItem value="undone">Undone</SelectItem>
                <SelectItem value="needs_you">Needs you</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="import-filter-from">From</FieldLabel>
            <Input
              id="import-filter-from"
              type="date"
              value={draft.from ?? ""}
              onChange={(event) => setDraft({ ...draft, from: event.target.value || undefined })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="import-filter-to">To</FieldLabel>
            <Input
              id="import-filter-to"
              type="date"
              value={draft.to ?? ""}
              onChange={(event) => setDraft({ ...draft, to: event.target.value || undefined })}
            />
          </Field>
        </>
      }
    />
  );
}
