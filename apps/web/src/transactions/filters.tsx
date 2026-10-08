import type { Account, Category, Merchant, Tag, TransactionListQuery } from "@num/shared";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { OptionCombobox } from "@/transactions/option-combobox";
import { hasFilters } from "@/transactions/query";

type FiltersProps = {
  search: TransactionListQuery;
  accounts: Account[];
  categories: Category[];
  merchants: Merchant[];
  tags: Tag[];
  onChange: (patch: Partial<TransactionListQuery>) => void;
  onClear: () => void;
};

function namedOptions(items: { id: string; name: string; archivedAt?: string | null }[]) {
  return items
    .filter((item) => !item.archivedAt)
    .map((item) => ({ id: item.id, label: item.name }));
}

export function TransactionFilters({
  search,
  accounts,
  categories,
  merchants,
  tags,
  onChange,
  onClear,
}: FiltersProps) {
  return (
    <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-3">
      <Field>
        <FieldLabel htmlFor="filter-account">Account</FieldLabel>
        <OptionCombobox
          id="filter-account"
          value={search.accountId ?? null}
          options={namedOptions(accounts)}
          placeholder="Any account"
          emptyLabel="Any account"
          onChange={(accountId) => onChange({ accountId: accountId ?? undefined })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="filter-category">Category</FieldLabel>
        <OptionCombobox
          id="filter-category"
          value={search.categoryId ?? null}
          options={namedOptions(categories)}
          placeholder="Any category"
          emptyLabel="Any category"
          onChange={(categoryId) => onChange({ categoryId: categoryId ?? undefined })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="filter-merchant">Merchant</FieldLabel>
        <OptionCombobox
          id="filter-merchant"
          value={search.merchantId ?? null}
          options={merchants.map((merchant) => ({ id: merchant.id, label: merchant.name }))}
          placeholder="Any merchant"
          emptyLabel="Any merchant"
          onChange={(merchantId) => onChange({ merchantId: merchantId ?? undefined })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="filter-tag">Tag</FieldLabel>
        <OptionCombobox
          id="filter-tag"
          value={search.tagId ?? null}
          options={namedOptions(tags)}
          placeholder="Any tag"
          emptyLabel="Any tag"
          onChange={(tagId) => onChange({ tagId: tagId ?? undefined })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="filter-from">From</FieldLabel>
        <Input
          id="filter-from"
          type="date"
          value={search.from ?? ""}
          onChange={(event) => onChange({ from: event.target.value || undefined })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="filter-to">To</FieldLabel>
        <Input
          id="filter-to"
          type="date"
          value={search.to ?? ""}
          onChange={(event) => onChange({ to: event.target.value || undefined })}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Toggle variant="outline" pressed={search.uncategorized} onPressedChange={(pressed) => onChange({ uncategorized: pressed })}>
          Uncategorized only
        </Toggle>
        {hasFilters(search) ? (
          <Button type="button" variant="ghost" onClick={onClear}>
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}
