import { accountLabel } from "@/accounts/label";
import { FilterBar, type FilterBadge } from "@/components/filter-bar";
import { Field, FieldLabel } from "@/components/ui/field";
import { DateField } from "@/components/date-field";
import { Switch } from "@/components/ui/switch";
import { useAccounts, useCategories, useGroups, useMerchants, useTags } from "@/editors/lookups";
import { OptionCombobox } from "@/transactions/option-combobox";
import { formatDate } from "@/transactions/format";
import { useTransactionSearch } from "@/transactions/use-transaction-list";
import { SortSelect } from "@/lists/sort-select";
import { useFilterDraft, useSearchText } from "@/lists/use-list-search";

const sortOptions = [
  { sort: "date", dir: "desc", label: "Date, newest" },
  { sort: "date", dir: "asc", label: "Date, oldest" },
  { sort: "amount", dir: "desc", label: "Amount, high to low" },
  { sort: "amount", dir: "asc", label: "Amount, low to high" },
  { sort: "payeeRaw", dir: "asc", label: "Payee, A to Z" },
  { sort: "payeeRaw", dir: "desc", label: "Payee, Z to A" },
] as const;

/** The filters of the panel with no choice. */
const noFilters = {
  accountId: undefined,
  categoryId: undefined,
  groupId: undefined,
  merchantId: undefined,
  tagId: undefined,
  from: undefined,
  to: undefined,
  uncategorized: false,
  automatic: false,
};

function namedOptions(items: { id: string; name: string; archivedAt?: string | null }[]) {
  return items.filter((item) => !item.archivedAt).map((item) => ({ id: item.id, label: accountLabel(item) }));
}

/** The filter bar of the Transactions list. It reads the filters from the URL and changes them there. */
export function TransactionFilterBar() {
  const { search, sort, patch, setSort } = useTransactionSearch();
  const accounts = useAccounts();
  const categories = useCategories();
  const groups = useGroups();
  const merchants = useMerchants().filter((merchant) => !merchant.archivedAt);
  const tags = useTags();
  const box = useSearchText(search.q, (q) => patch({ q }));
  const { draft, changes, change, reset } = useFilterDraft(search);

  function nameOf(items: { id: string; name: string }[], id: string | undefined) {
    return items.find((item) => item.id === id)?.name;
  }

  const badges: FilterBadge[] = [];
  const selectedAccount = accounts.find((account) => account.id === search.accountId);
  const accountName = selectedAccount ? accountLabel(selectedAccount) : undefined;
  if (search.accountId && accountName) {
    badges.push({ key: "account", label: `Account: ${accountName}`, onRemove: () => patch({ accountId: undefined }) });
  }
  const categoryName = nameOf(categories, search.categoryId);
  if (search.categoryId && categoryName) {
    badges.push({ key: "category", label: `Category: ${categoryName}`, onRemove: () => patch({ categoryId: undefined }) });
  }
  if (search.groupId === "none") {
    badges.push({ key: "group", label: "Group: No group", onRemove: () => patch({ groupId: undefined }) });
  } else if (search.groupId) {
    badges.push({ key: "group", label: `Group: ${nameOf(groups, search.groupId) ?? "Group"}`, onRemove: () => patch({ groupId: undefined }) });
  }
  if (search.merchantId === "none") {
    badges.push({ key: "merchant", label: "Merchant: No merchant", onRemove: () => patch({ merchantId: undefined }) });
  } else {
    const merchantName = nameOf(merchants, search.merchantId);
    if (search.merchantId && merchantName) {
      badges.push({ key: "merchant", label: `Merchant: ${merchantName}`, onRemove: () => patch({ merchantId: undefined }) });
    }
  }
  if (search.tagId === "none") {
    badges.push({ key: "tag", label: "Tag: No tag", onRemove: () => patch({ tagId: undefined }) });
  } else {
    const tagName = nameOf(tags, search.tagId);
    if (search.tagId && tagName) {
      badges.push({ key: "tag", label: `Tag: ${tagName}`, onRemove: () => patch({ tagId: undefined }) });
    }
  }
  if (search.from) {
    badges.push({ key: "from", label: `From: ${formatDate(search.from)}`, onRemove: () => patch({ from: undefined }) });
  }
  if (search.to) {
    badges.push({ key: "to", label: `To: ${formatDate(search.to)}`, onRemove: () => patch({ to: undefined }) });
  }
  if (search.uncategorized) {
    badges.push({ key: "uncategorized", label: "Uncategorized", onRemove: () => patch({ uncategorized: false }) });
  }
  if (search.automatic) {
    badges.push({ key: "automatic", label: "Automatic", onRemove: () => patch({ automatic: false }) });
  }

  return (
    <FilterBar
      search={{
        id: "transaction-search",
        value: box.text,
        placeholder: "Payee, notes or merchant",
        label: "Search",
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
      onClearAll={() => patch(noFilters)}
      sort={<SortSelect id="transaction-sort" label="Sort" value={sort} options={sortOptions} onChange={setSort} />}
      fields={
        <>
          <Field>
            <FieldLabel htmlFor="filter-account">Account</FieldLabel>
            <OptionCombobox
              id="filter-account"
              value={draft.accountId ?? null}
              options={namedOptions(accounts)}
              placeholder="Any account"
              emptyLabel="Any account"
              onChange={(accountId) => change({ accountId: accountId ?? undefined })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="filter-category">Category</FieldLabel>
            <OptionCombobox
              id="filter-category"
              value={draft.categoryId ?? null}
              options={namedOptions(categories)}
              placeholder="Any category"
              emptyLabel="Any category"
              onChange={(categoryId) => change({ categoryId: categoryId ?? undefined })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="filter-group">Group</FieldLabel>
            <OptionCombobox
              id="filter-group"
              value={draft.groupId ?? null}
              options={[{ id: "none", label: "No group" }, ...groups.map((group) => ({ id: group.id, label: group.name }))]}
              placeholder="Any group"
              emptyLabel="Any group"
              onChange={(groupId) => change({ groupId: groupId ?? undefined })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="filter-merchant">Merchant</FieldLabel>
            <OptionCombobox
              id="filter-merchant"
              value={draft.merchantId ?? null}
              options={[{ id: "none", label: "No merchant" }, ...merchants.map((merchant) => ({ id: merchant.id, label: merchant.name }))]}
              placeholder="Any merchant"
              emptyLabel="Any merchant"
              onChange={(merchantId) => change({ merchantId: merchantId ?? undefined })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="filter-tag">Tag</FieldLabel>
            <OptionCombobox
              id="filter-tag"
              value={draft.tagId ?? null}
              options={[{ id: "none", label: "No tag" }, ...namedOptions(tags)]}
              placeholder="Any tag"
              emptyLabel="Any tag"
              onChange={(tagId) => change({ tagId: tagId ?? undefined })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="filter-from">From</FieldLabel>
            <DateField
              id="filter-from"
              value={draft.from ?? ""}
              onChange={(value) => change({ from: value || undefined })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="filter-to">To</FieldLabel>
            <DateField
              id="filter-to"
              value={draft.to ?? ""}
              onChange={(value) => change({ to: value || undefined })}
            />
          </Field>
          <Field orientation="horizontal">
            <Switch
              id="filter-uncategorized"
              checked={draft.uncategorized}
              onCheckedChange={(pressed) => change({ uncategorized: pressed })}
            />
            <FieldLabel htmlFor="filter-uncategorized">Uncategorized only</FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Switch
              id="filter-automatic"
              checked={draft.automatic}
              onCheckedChange={(pressed) => change({ automatic: pressed })}
            />
            <FieldLabel htmlFor="filter-automatic">Automatic</FieldLabel>
          </Field>
        </>
      }
    />
  );
}
