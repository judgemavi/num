import { useSuspenseQuery } from "@tanstack/react-query";
import { activeAccountsQuery } from "@/api/accounts";
import { FilterBar, type FilterBadge } from "@/components/filter-bar";
import { SortSelect } from "@/lists/sort-select";
import { useAppForm } from "@/forms/form-hook";
import { fieldValue } from "@/forms/form-values";
import { useImportSearch } from "@/accounts/use-import-search";
import { importStatusLabel } from "@/accounts/import-format";
import { accountLabel } from "@/accounts/label";
import { formatDate } from "@/date-format";

const sortOptions = [
  { sort: "date", dir: "desc", label: "Date, newest" },
  { sort: "date", dir: "asc", label: "Date, oldest" },
] as const;

const statusOptions = [
  { value: "any", label: "Any status" },
  { value: "imported", label: "Imported" },
  { value: "undone", label: "Undone" },
  { value: "needs_you", label: "Needs you" },
] as const;

/** The filters of the panel with no choice. The controls use null, "any" and "" for no choice. */
const noFilters = {
  accountId: fieldValue<string | null>(null),
  status: fieldValue<(typeof statusOptions)[number]["value"]>("any"),
  from: "",
  to: "",
};

/** The filters for the URL. No choice is not in the URL. */
function urlFilters(value: typeof noFilters) {
  return {
    accountId: value.accountId ?? undefined,
    status: value.status === "any" ? undefined : value.status,
    from: value.from || undefined,
    to: value.to || undefined,
  };
}

/** The filter bar of the Imports list. It reads the filters from the URL and changes them there. */
export function ImportFilterBar() {
  const { search, sort, patch, setSort } = useImportSearch();
  // The panel keeps the changes of the person until the person applies them.
  const panel = useAppForm({
    defaultValues: { accountId: search.accountId ?? null, status: search.status ?? noFilters.status, from: search.from ?? "", to: search.to ?? "" },
    onSubmit: ({ value }) => patch(urlFilters(value)),
  });
  const accounts = useSuspenseQuery(activeAccountsQuery()).data.items;
  const selectedAccount = accounts.find((account) => account.id === search.accountId);
  const accountName = selectedAccount ? accountLabel(selectedAccount) : undefined;

  const badges: FilterBadge[] = [];
  if (search.accountId && accountName) {
    badges.push({
      key: "account",
      label: `Account: ${accountName}`,
      onRemove: () => patch({ accountId: undefined }),
    });
  }
  if (search.status) {
    badges.push({
      key: "status",
      label: `Status: ${importStatusLabel(search.status)}`,
      onRemove: () => patch({ status: undefined }),
    });
  }
  if (search.from) {
    badges.push({ key: "from", label: `From: ${formatDate(search.from)}`, onRemove: () => patch({ from: undefined }) });
  }
  if (search.to) {
    badges.push({ key: "to", label: `To: ${formatDate(search.to)}`, onRemove: () => patch({ to: undefined }) });
  }

  return (
    <FilterBar
      activeCount={badges.length}
      badges={badges}
      onOpenChange={(open) => {
        if (open) {
          panel.reset();
        }
      }}
      onApply={() => void panel.handleSubmit()}
      onClear={() => panel.reset(noFilters, { keepDefaultValues: true })}
      onClearAll={() => patch(urlFilters(noFilters))}
      sort={<SortSelect id="import-sort" label="Sort" value={sort} options={sortOptions} onChange={setSort} />}
      fields={
        <>
          <panel.AppField name="accountId">
            {(field) => (
              <field.ComboboxField
                id="import-filter-account"
                label="Account"
                options={accounts.map((account) => ({ id: account.id, label: accountLabel(account) }))}
                placeholder="Any account"
                emptyLabel="Any account"
              />
            )}
          </panel.AppField>
          <panel.AppField name="status">{(field) => <field.SelectField id="import-filter-status" label="Status" options={statusOptions} />}</panel.AppField>
          <panel.AppField name="from">{(field) => <field.DateInputField id="import-filter-from" label="From" />}</panel.AppField>
          <panel.AppField name="to">{(field) => <field.DateInputField id="import-filter-to" label="To" />}</panel.AppField>
        </>
      }
    />
  );
}
