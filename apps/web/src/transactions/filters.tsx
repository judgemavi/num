import type { Account, Category, CategoryGroup, Merchant, Tag, TransactionListQuery } from "@num/shared";
import { useEffect, useState } from "react";
import { accountLabel } from "@/accounts/label";
import { FilterBar, type FilterBadge } from "@/components/filter-bar";
import { sortChoice } from "@/components/sort-choice";
import { Field, FieldLabel } from "@/components/ui/field";
import { DateField } from "@/components/date-field";
import { Switch } from "@/components/ui/switch";
import { OptionCombobox } from "@/transactions/option-combobox";
import { formatDate } from "@/transactions/format";

type TransactionFilterBarProps = {
  search: TransactionListQuery;
  accounts: Account[];
  categories: Category[];
  groups: CategoryGroup[];
  merchants: Merchant[];
  tags: Tag[];
  onChange: (patch: Partial<TransactionListQuery>) => void;
};

type Draft = {
  accountId?: string;
  categoryId?: string;
  groupId?: string;
  merchantId?: string;
  tagId?: string;
  from?: string;
  to?: string;
  uncategorized: boolean;
  automatic: boolean;
};

const sortOptions = [
  { value: "date:desc", label: "Date, newest" },
  { value: "date:asc", label: "Date, oldest" },
  { value: "amount:desc", label: "Amount, high to low" },
  { value: "amount:asc", label: "Amount, low to high" },
  { value: "payeeRaw:asc", label: "Payee, A to Z" },
  { value: "payeeRaw:desc", label: "Payee, Z to A" },
];

function namedOptions(items: { id: string; name: string; archivedAt?: string | null }[]) {
  return items.filter((item) => !item.archivedAt).map((item) => ({ id: item.id, label: accountLabel(item) }));
}

function draftFrom(search: TransactionListQuery): Draft {
  return {
    accountId: search.accountId,
    categoryId: search.categoryId,
    groupId: search.groupId,
    merchantId: search.merchantId,
    tagId: search.tagId,
    from: search.from,
    to: search.to,
    uncategorized: search.uncategorized,
    automatic: search.automatic,
  };
}

function applySort(value: string): Partial<TransactionListQuery> {
  const [column, dir] = value.split(":");
  if (column === "date" && dir === "desc") {
    return { sort: undefined, dir: undefined };
  }
  if (column !== "date" && column !== "amount" && column !== "payeeRaw") {
    return {};
  }
  if (dir !== "asc" && dir !== "desc") {
    return {};
  }
  return { sort: column, dir };
}

export function TransactionFilterBar({ search, accounts, categories, groups, merchants, tags, onChange }: TransactionFilterBarProps) {
  const [text, setText] = useState(search.q ?? "");
  const [seenQuery, setSeenQuery] = useState(search.q);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(search));

  if (search.q !== seenQuery) {
    setSeenQuery(search.q);
    setText(search.q ?? "");
  }

  useEffect(() => {
    const next = text.trim();
    const current = search.q ?? "";
    if (next === current) {
      return;
    }
    const handle = window.setTimeout(() => {
      onChange({ q: next.length === 0 ? undefined : next });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [onChange, search.q, text]);

  function nameOf(items: { id: string; name: string }[], id: string | undefined) {
    return items.find((item) => item.id === id)?.name;
  }

  const badges: FilterBadge[] = [];
  const selectedAccount = accounts.find((account) => account.id === search.accountId);
  const accountName = selectedAccount ? accountLabel(selectedAccount) : undefined;
  if (search.accountId && accountName) {
    badges.push({ key: "account", label: `Account: ${accountName}`, onRemove: () => onChange({ accountId: undefined }) });
  }
  const categoryName = nameOf(categories, search.categoryId);
  if (search.categoryId && categoryName) {
    badges.push({ key: "category", label: `Category: ${categoryName}`, onRemove: () => onChange({ categoryId: undefined }) });
  }
  if (search.groupId === "none") {
    badges.push({ key: "group", label: "Group: No group", onRemove: () => onChange({ groupId: undefined }) });
  } else if (search.groupId) {
    badges.push({ key: "group", label: `Group: ${nameOf(groups, search.groupId) ?? "Group"}`, onRemove: () => onChange({ groupId: undefined }) });
  }
  if (search.merchantId === "none") {
    badges.push({ key: "merchant", label: "Merchant: No merchant", onRemove: () => onChange({ merchantId: undefined }) });
  } else {
    const merchantName = nameOf(merchants, search.merchantId);
    if (search.merchantId && merchantName) {
      badges.push({ key: "merchant", label: `Merchant: ${merchantName}`, onRemove: () => onChange({ merchantId: undefined }) });
    }
  }
  if (search.tagId === "none") {
    badges.push({ key: "tag", label: "Tag: No tag", onRemove: () => onChange({ tagId: undefined }) });
  } else {
    const tagName = nameOf(tags, search.tagId);
    if (search.tagId && tagName) {
      badges.push({ key: "tag", label: `Tag: ${tagName}`, onRemove: () => onChange({ tagId: undefined }) });
    }
  }
  if (search.from) {
    badges.push({ key: "from", label: `From: ${formatDate(search.from)}`, onRemove: () => onChange({ from: undefined }) });
  }
  if (search.to) {
    badges.push({ key: "to", label: `To: ${formatDate(search.to)}`, onRemove: () => onChange({ to: undefined }) });
  }
  if (search.uncategorized) {
    badges.push({ key: "uncategorized", label: "Uncategorized", onRemove: () => onChange({ uncategorized: false }) });
  }
  if (search.automatic) {
    badges.push({ key: "automatic", label: "Automatic", onRemove: () => onChange({ automatic: false }) });
  }

  function applyDraft() {
    onChange({
      accountId: draft.accountId,
      categoryId: draft.categoryId,
      groupId: draft.groupId,
      merchantId: draft.merchantId,
      tagId: draft.tagId,
      from: draft.from,
      to: draft.to,
      uncategorized: draft.uncategorized,
      automatic: draft.automatic,
    });
  }

  function clearFilters() {
    onChange({
      accountId: undefined,
      categoryId: undefined,
      groupId: undefined,
      merchantId: undefined,
      tagId: undefined,
      from: undefined,
      to: undefined,
      uncategorized: false,
      automatic: false,
    });
  }

  return (
    <FilterBar
      search={{
        id: "transaction-search",
        value: text,
        placeholder: "Payee, notes or merchant",
        label: "Search",
        onChange: setText,
      }}
      activeCount={badges.length}
      badges={badges}
      onOpenChange={(open) => {
        if (open) {
          setDraft(draftFrom(search));
        }
      }}
      onApply={applyDraft}
      onClear={() => setDraft({ uncategorized: false, automatic: false })}
      onClearAll={clearFilters}
      sort={{
        id: "transaction-sort",
        label: "Sort",
        value: sortChoice(search.sort, search.dir, "date", "desc"),
        options: sortOptions,
        onChange: (value) => onChange(applySort(value)),
      }}
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
              onChange={(accountId) => setDraft({ ...draft, accountId: accountId ?? undefined })}
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
              onChange={(categoryId) => setDraft({ ...draft, categoryId: categoryId ?? undefined })}
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
              onChange={(groupId) => setDraft({ ...draft, groupId: groupId ?? undefined })}
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
              onChange={(merchantId) => setDraft({ ...draft, merchantId: merchantId ?? undefined })}
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
              onChange={(tagId) => setDraft({ ...draft, tagId: tagId ?? undefined })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="filter-from">From</FieldLabel>
            <DateField
              id="filter-from"
              value={draft.from ?? ""}
              onChange={(value) => setDraft({ ...draft, from: value || undefined })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="filter-to">To</FieldLabel>
            <DateField
              id="filter-to"
              value={draft.to ?? ""}
              onChange={(value) => setDraft({ ...draft, to: value || undefined })}
            />
          </Field>
          <Field orientation="horizontal">
            <Switch
              id="filter-uncategorized"
              checked={draft.uncategorized}
              onCheckedChange={(pressed) => setDraft({ ...draft, uncategorized: pressed })}
            />
            <FieldLabel htmlFor="filter-uncategorized">Uncategorized only</FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Switch
              id="filter-automatic"
              checked={draft.automatic}
              onCheckedChange={(pressed) => setDraft({ ...draft, automatic: pressed })}
            />
            <FieldLabel htmlFor="filter-automatic">Automatic</FieldLabel>
          </Field>
        </>
      }
    />
  );
}
