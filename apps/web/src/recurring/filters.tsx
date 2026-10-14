import { accountLabel } from "@/accounts/label";
import { FilterBar, type FilterBadge } from "@/components/filter-bar";
import { ChoiceSelect } from "@/components/choice-select";
import { SortSelect } from "@/lists/sort-select";
import { useFilterDraft, useSearchText } from "@/lists/use-list-search";
import { usePlanSearch } from "@/recurring/use-plan-search";
import { useAccountLabels, useAccounts } from "@/editors/lookups";
import { kindLabel } from "@/recurring/format";
import { OptionCombobox } from "@/transactions/option-combobox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

const sortOptions = [
  { sort: "name", dir: "asc", label: "Name" },
  { sort: "name", dir: "desc", label: "Name, Z to A" },
  { sort: "startDate", dir: "asc", label: "Start date" },
  { sort: "startDate", dir: "desc", label: "Start date, newest" },
] as const;

const kindOptions = [
  { value: "any", label: "Any kind" },
  { value: "income", label: "Income" },
  { value: "bill", label: "Bill" },
  { value: "transfer", label: "Transfer" },
] as const;

/** The filters of the panel with no choice. */
const noFilters = { kind: undefined, accountId: undefined, archived: false };

/** The filter bar of the Recurring list. It reads the filters from the URL and changes them there. */
export function PlanFilters() {
  const { search, sort, patch, setSort } = usePlanSearch();
  const accounts = useAccounts();
  const accountLabels = useAccountLabels();
  const box = useSearchText(search.q, (q) => patch({ q }));
  const { draft, changes, change, reset } = useFilterDraft(search);

  const accountName = search.accountId ? accountLabels.get(search.accountId) : undefined;
  const badges: FilterBadge[] = [];
  if (search.kind) {
    badges.push({ key: "kind", label: `Kind: ${kindLabel(search.kind)}`, onRemove: () => patch({ kind: undefined }) });
  }
  if (search.accountId && accountName) {
    badges.push({
      key: "account",
      label: `Account: ${accountName}`,
      onRemove: () => patch({ accountId: undefined }),
    });
  }
  if (search.archived) {
    badges.push({ key: "archived", label: "Archived", onRemove: () => patch({ archived: false }) });
  }

  return (
    <FilterBar
      search={{
        id: "plan-search",
        value: box.text,
        placeholder: "Search recurring",
        label: "Search recurring",
        onChange: box.change,
      }}
      activeCount={badges.length}
      badges={badges}
      onOpenChange={(open) => {
        if (open) {
          reset();
        }
      }}
      onApply={() => patch(changes)}
      onClear={() => change(noFilters)}
      onClearAll={() => {
        box.clear();
        patch({ q: undefined, ...noFilters });
      }}
      sort={<SortSelect id="plan-sort" label="Sort recurring" value={sort} options={sortOptions} onChange={setSort} />}
      fields={
        <>
          <Field>
            <FieldLabel htmlFor="plan-kind">Kind</FieldLabel>
            <ChoiceSelect
              id="plan-kind"
              className="w-full"
              value={draft.kind ?? "any"}
              options={kindOptions}
              onValueChange={(kind) => change({ kind: kind === "any" ? undefined : kind })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="plan-account">Account</FieldLabel>
            <OptionCombobox
              id="plan-account"
              value={draft.accountId ?? null}
              options={accounts.filter((item) => !item.archivedAt).map((item) => ({ id: item.id, label: accountLabel(item) }))}
              placeholder="Any account"
              emptyLabel="Any account"
              onChange={(accountId) => change({ accountId: accountId ?? undefined })}
            />
          </Field>
          <Field orientation="horizontal">
            <Switch id="plan-archived" checked={draft.archived} onCheckedChange={(archived) => change({ archived })} />
            <FieldLabel htmlFor="plan-archived">Show archived</FieldLabel>
          </Field>
        </>
      }
    />
  );
}
