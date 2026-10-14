import { accountLabel } from "@/accounts/label";
import { FilterBar, type FilterBadge } from "@/components/filter-bar";
import { SortSelect } from "@/lists/sort-select";
import { SearchBox } from "@/lists/search-box";
import { useAppForm } from "@/forms/form-hook";
import { fieldValue } from "@/forms/form-values";
import { usePlanSearch } from "@/recurring/use-plan-search";
import { useAccountLabels, useAccounts } from "@/editors/lookups";
import { kindLabel } from "@/recurring/format";

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
const noFilters = { kind: fieldValue<(typeof kindOptions)[number]["value"]>("any"), accountId: fieldValue<string | null>(null), archived: false };

/** The filters for the URL. No choice is not in the URL. */
function urlFilters(value: typeof noFilters) {
  return { kind: value.kind === "any" ? undefined : value.kind, accountId: value.accountId ?? undefined, archived: value.archived };
}

/** The filter bar of the Recurring list. It reads the filters from the URL and changes them there. */
export function PlanFilters() {
  const { search, sort, patch, setSort } = usePlanSearch();
  const accounts = useAccounts();
  const accountLabels = useAccountLabels();
  // The panel keeps the changes of the person until the person applies them.
  const panel = useAppForm({
    defaultValues: { kind: search.kind ?? noFilters.kind, accountId: search.accountId ?? null, archived: search.archived },
    onSubmit: ({ value }) => patch(urlFilters(value)),
  });

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
      search={<SearchBox id="plan-search" placeholder="Search recurring" label="Search recurring" query={search.q} onQuery={(q) => patch({ q })} />}
      activeCount={badges.length}
      badges={badges}
      onOpenChange={(open) => {
        if (open) {
          panel.reset();
        }
      }}
      onApply={() => void panel.handleSubmit()}
      onClear={() => panel.reset(noFilters, { keepDefaultValues: true })}
      onClearAll={() => patch({ q: undefined, ...urlFilters(noFilters) })}
      sort={<SortSelect id="plan-sort" label="Sort recurring" value={sort} options={sortOptions} onChange={setSort} />}
      fields={
        <>
          <panel.AppField name="kind">{(field) => <field.SelectField id="plan-kind" label="Kind" options={kindOptions} />}</panel.AppField>
          <panel.AppField name="accountId">
            {(field) => (
              <field.ComboboxField
                id="plan-account"
                label="Account"
                options={accounts.filter((item) => !item.archivedAt).map((item) => ({ id: item.id, label: accountLabel(item) }))}
                placeholder="Any account"
                emptyLabel="Any account"
              />
            )}
          </panel.AppField>
          <panel.AppField name="archived">{(field) => <field.SwitchField id="plan-archived" label="Show archived" />}</panel.AppField>
        </>
      }
    />
  );
}
