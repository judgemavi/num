import type { TransactionFilter } from "@num/shared";
import { accountLabel } from "@/accounts/label";
import { FilterBar, type FilterBadge } from "@/components/filter-bar";
import { useAccounts, useCategories, useGroups, useMerchants, useTags } from "@/editors/lookups";
import { formatDate } from "@/transactions/format";
import { useAllSearch, useOnReview, useReviewSearch, useTransactionSearch } from "@/transactions/use-transaction-list";
import { SortSelect } from "@/lists/sort-select";
import { SearchBox } from "@/lists/search-box";
import { useAppForm } from "@/forms/form-hook";
import { fieldValue } from "@/forms/form-values";

const sortOptions = [
  { sort: "date", dir: "desc", label: "Date, newest" },
  { sort: "date", dir: "asc", label: "Date, oldest" },
  { sort: "amount", dir: "desc", label: "Amount, high to low" },
  { sort: "amount", dir: "asc", label: "Amount, low to high" },
  { sort: "payeeRaw", dir: "asc", label: "Payee, A to Z" },
  { sort: "payeeRaw", dir: "desc", label: "Payee, Z to A" },
] as const;

/** Needs review also sorts by confidence (decision 0049). */
const reviewSortOptions = [
  ...sortOptions,
  { sort: "confidence", dir: "asc", label: "Confidence, low to high" },
  { sort: "confidence", dir: "desc", label: "Confidence, high to low" },
] as const;

function AllSort() {
  const { sort, setSort } = useAllSearch();
  return <SortSelect id="transaction-sort" label="Sort" value={sort} options={sortOptions} onChange={setSort} />;
}

function ReviewSort() {
  const { sort, setSort } = useReviewSearch();
  return <SortSelect id="transaction-sort" label="Sort" value={sort} options={reviewSortOptions} onChange={setSort} />;
}

/** The filters of the panel with no choice. The controls use null and "" for no choice. */
const noFilters = {
  accountId: fieldValue<string | null>(null),
  categoryId: fieldValue<string | null>(null),
  groupId: fieldValue<string | null>(null),
  merchantId: fieldValue<string | null>(null),
  tagId: fieldValue<string | null>(null),
  from: "",
  to: "",
  uncategorized: false,
  automatic: false,
};

/** The values of the filter panel for the filters in the URL. */
function panelValues(search: TransactionFilter) {
  return {
    accountId: search.accountId ?? null,
    categoryId: search.categoryId ?? null,
    groupId: search.groupId ?? null,
    merchantId: search.merchantId ?? null,
    tagId: search.tagId ?? null,
    from: search.from ?? "",
    to: search.to ?? "",
    uncategorized: search.uncategorized,
    automatic: search.automatic,
  };
}

/** The filters for the URL. No choice is not in the URL. */
function urlFilters(value: typeof noFilters) {
  return {
    accountId: value.accountId ?? undefined,
    categoryId: value.categoryId ?? undefined,
    groupId: value.groupId ?? undefined,
    merchantId: value.merchantId ?? undefined,
    tagId: value.tagId ?? undefined,
    from: value.from || undefined,
    to: value.to || undefined,
    uncategorized: value.uncategorized,
    automatic: value.automatic,
  };
}

function namedOptions(items: { id: string; name: string; archivedAt?: string | null }[]) {
  return items.filter((item) => !item.archivedAt).map((item) => ({ id: item.id, label: accountLabel(item) }));
}

/** The filter bar of the Transactions list. It reads the filters from the URL and changes them there. */
export function TransactionFilterBar() {
  const { search, patch } = useTransactionSearch();
  const review = useOnReview();
  const accounts = useAccounts();
  const categories = useCategories();
  const groups = useGroups();
  const merchants = useMerchants().filter((merchant) => !merchant.archivedAt);
  const tags = useTags();
  // The panel keeps the changes of the person until the person applies them.
  const panel = useAppForm({
    defaultValues: panelValues(search),
    onSubmit: ({ value }) => patch(urlFilters(value)),
  });

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
      search={<SearchBox id="transaction-search" placeholder="Payee or merchant" label="Search" query={search.q} onQuery={(q) => patch({ q })} />}
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
      sort={review ? <ReviewSort /> : <AllSort />}
      fields={
        <>
          <panel.AppField name="accountId">
            {(field) => <field.ComboboxField id="filter-account" label="Account" options={namedOptions(accounts)} placeholder="Any account" emptyLabel="Any account" />}
          </panel.AppField>
          <panel.AppField name="categoryId">
            {(field) => (
              <field.ComboboxField id="filter-category" label="Category" options={namedOptions(categories)} placeholder="Any category" emptyLabel="Any category" />
            )}
          </panel.AppField>
          <panel.AppField name="groupId">
            {(field) => (
              <field.ComboboxField
                id="filter-group"
                label="Group"
                options={[{ id: "none", label: "No group" }, ...groups.map((group) => ({ id: group.id, label: group.name }))]}
                placeholder="Any group"
                emptyLabel="Any group"
              />
            )}
          </panel.AppField>
          <panel.AppField name="merchantId">
            {(field) => (
              <field.ComboboxField
                id="filter-merchant"
                label="Merchant"
                options={[{ id: "none", label: "No merchant" }, ...merchants.map((merchant) => ({ id: merchant.id, label: merchant.name }))]}
                placeholder="Any merchant"
                emptyLabel="Any merchant"
              />
            )}
          </panel.AppField>
          <panel.AppField name="tagId">
            {(field) => (
              <field.ComboboxField
                id="filter-tag"
                label="Tag"
                options={[{ id: "none", label: "No tag" }, ...namedOptions(tags)]}
                placeholder="Any tag"
                emptyLabel="Any tag"
              />
            )}
          </panel.AppField>
          <panel.AppField name="from">{(field) => <field.DateInputField id="filter-from" label="From" />}</panel.AppField>
          <panel.AppField name="to">{(field) => <field.DateInputField id="filter-to" label="To" />}</panel.AppField>
          <panel.AppField name="uncategorized">{(field) => <field.SwitchField id="filter-uncategorized" label="Uncategorized only" />}</panel.AppField>
          <panel.AppField name="automatic">{(field) => <field.SwitchField id="filter-automatic" label="Automatic" />}</panel.AppField>
        </>
      }
    />
  );
}
