import { useSuspenseQuery } from "@tanstack/react-query";
import { activeAccountsQuery } from "@/api/accounts";
import { FilterBar, type FilterBadge } from "@/components/filter-bar";
import { ChoiceSelect } from "@/components/choice-select";
import { SortSelect } from "@/lists/sort-select";
import { useFilterDraft } from "@/lists/use-list-search";
import { useImportSearch } from "@/accounts/use-import-search";
import { Field, FieldLabel } from "@/components/ui/field";
import { DateField } from "@/components/date-field";
import { importStatusLabel } from "@/accounts/import-format";
import { accountLabel } from "@/accounts/label";
import { formatDate } from "@/transactions/format";
import { OptionCombobox } from "@/transactions/option-combobox";

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

/** The filters of the panel with no choice. */
const noFilters = { accountId: undefined, status: undefined, from: undefined, to: undefined };

/** The filter bar of the Imports list. It reads the filters from the URL and changes them there. */
export function ImportFilterBar() {
  const { search, sort, patch, setSort } = useImportSearch();
  const { draft, changes, change, reset } = useFilterDraft(search);
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
          reset();
        }
      }}
      onApply={() => patch(changes)}
      onClear={() => change(noFilters)}
      onClearAll={() => patch(noFilters)}
      sort={<SortSelect id="import-sort" label="Sort" value={sort} options={sortOptions} onChange={setSort} />}
      fields={
        <>
          <Field>
            <FieldLabel htmlFor="import-filter-account">Account</FieldLabel>
            <OptionCombobox
              id="import-filter-account"
              value={draft.accountId ?? null}
              options={accounts.map((account) => ({ id: account.id, label: accountLabel(account) }))}
              placeholder="Any account"
              emptyLabel="Any account"
              onChange={(accountId) => change({ accountId: accountId ?? undefined })}
            />
          </Field>
          <Field>
            <FieldLabel>Status</FieldLabel>
            <ChoiceSelect
              className="w-full"
              value={draft.status ?? "any"}
              options={statusOptions}
              onValueChange={(status) => change({ status: status === "any" ? undefined : status })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="import-filter-from">From</FieldLabel>
            <DateField
              id="import-filter-from"
              value={draft.from ?? ""}
              onChange={(value) => change({ from: value || undefined })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="import-filter-to">To</FieldLabel>
            <DateField
              id="import-filter-to"
              value={draft.to ?? ""}
              onChange={(value) => change({ to: value || undefined })}
            />
          </Field>
        </>
      }
    />
  );
}
