import type { Account, PlanKind, PlanListQuery } from "@num/shared";
import { useEffect, useState } from "react";
import { accountLabel } from "@/accounts/label";
import { FilterBar, type FilterBadge } from "@/components/filter-bar";
import { sortChoice } from "@/components/sort-choice";
import { kindLabel } from "@/recurring/format";
import { OptionCombobox } from "@/transactions/option-combobox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type PlanFiltersProps = {
  search: PlanListQuery;
  accounts: Account[];
  onChange: (patch: Partial<PlanListQuery>) => void;
};

type Draft = {
  kind?: PlanKind;
  accountId?: string;
  archived: boolean;
};

const sortOptions = [
  { value: "name:asc", label: "Name" },
  { value: "name:desc", label: "Name, Z to A" },
  { value: "startDate:asc", label: "Start date" },
  { value: "startDate:desc", label: "Start date, newest" },
];

function draftFrom(search: PlanListQuery): Draft {
  return { kind: search.kind, accountId: search.accountId, archived: search.archived };
}

function applySort(value: string): Partial<PlanListQuery> {
  if (value === "name:asc") {
    return { sort: undefined, dir: undefined };
  }
  const [column, dir] = value.split(":");
  if ((column !== "name" && column !== "startDate") || (dir !== "asc" && dir !== "desc")) {
    return {};
  }
  return { sort: column, dir };
}

export function PlanFilters({ search, accounts, onChange }: PlanFiltersProps) {
  const [text, setText] = useState(search.q ?? "");
  const [seenQuery, setSeenQuery] = useState(search.q);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(search));

  if (search.q !== seenQuery) {
    setSeenQuery(search.q);
    setText(search.q ?? "");
  }

  useEffect(() => {
    const next = text.trim();
    if (next === (search.q ?? "")) {
      return;
    }
    const handle = window.setTimeout(() => {
      onChange({ q: next.length === 0 ? undefined : next });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [onChange, search.q, text]);

  const selectedAccount = accounts.find((account) => account.id === search.accountId);
  const accountName = selectedAccount ? accountLabel(selectedAccount) : undefined;
  const badges: FilterBadge[] = [];
  if (search.kind) {
    badges.push({ key: "kind", label: `Kind: ${kindLabel(search.kind)}`, onRemove: () => onChange({ kind: undefined }) });
  }
  if (search.accountId && accountName) {
    badges.push({
      key: "account",
      label: `Account: ${accountName}`,
      onRemove: () => onChange({ accountId: undefined }),
    });
  }
  if (search.archived) {
    badges.push({ key: "archived", label: "Archived", onRemove: () => onChange({ archived: false }) });
  }

  return (
    <FilterBar
      search={{
        id: "plan-search",
        value: text,
        placeholder: "Search recurring",
        label: "Search recurring",
        onChange: setText,
      }}
      activeCount={badges.length}
      badges={badges}
      onOpenChange={(open) => {
        if (open) {
          setDraft(draftFrom(search));
        }
      }}
      onApply={() => onChange({ kind: draft.kind, accountId: draft.accountId, archived: draft.archived })}
      onClear={() => setDraft({ archived: false })}
      onClearAll={() => {
        setText("");
        onChange({ q: undefined, kind: undefined, accountId: undefined, archived: false });
      }}
      sort={{
        id: "plan-sort",
        label: "Sort recurring",
        value: sortChoice(search.sort, search.dir, "name", "asc"),
        options: sortOptions,
        onChange: (value) => onChange(applySort(value)),
      }}
      fields={
        <>
          <Field>
            <FieldLabel htmlFor="plan-kind">Kind</FieldLabel>
            <Select
              value={draft.kind ?? "any"}
              onValueChange={(value) => setDraft({ ...draft, kind: value === "any" ? undefined : (value as PlanKind) })}
            >
              <SelectTrigger id="plan-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any kind</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="bill">Bill</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="plan-account">Account</FieldLabel>
            <OptionCombobox
              id="plan-account"
              value={draft.accountId ?? null}
              options={accounts.filter((item) => !item.archivedAt).map((item) => ({ id: item.id, label: accountLabel(item) }))}
              placeholder="Any account"
              emptyLabel="Any account"
              onChange={(accountId) => setDraft({ ...draft, accountId: accountId ?? undefined })}
            />
          </Field>
          <Field orientation="horizontal">
            <Switch id="plan-archived" checked={draft.archived} onCheckedChange={(archived) => setDraft({ ...draft, archived })} />
            <FieldLabel htmlFor="plan-archived">Show archived</FieldLabel>
          </Field>
        </>
      }
    />
  );
}
