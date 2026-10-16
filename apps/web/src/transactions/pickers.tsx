import { merchantNameFromPayee, type AccountKind, type CategoryKind } from "@num/shared";
import { AccountForm } from "@/accounts/account-form";
import { accountLabel, accountOptionLabel } from "@/accounts/label";
import { useArchiveAccount } from "@/api/accounts";
import { useArchiveCategory } from "@/api/categories";
import { useArchiveMerchant } from "@/api/merchants";
import { useAccounts, useCategories, useMerchants } from "@/editors/lookups";
import { ManagedPicker } from "@/editors/managed-picker";
import { CategoryForm } from "@/settings/category-form";
import { MerchantForm } from "@/settings/merchant-form";
import { categoryOptions, merchantOptionLists } from "@/transactions/picker-options";

/**
 * The pickers of the Transaction editor. Each picker reads its own options, restores an archived record, and shows
 * the form that creates a record on the spot. The form that uses a picker keeps only the selected id.
 */
type PickerProps = {
  id: string;
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  /** The number of inline forms that contain the picker. */
  depth?: number;
};

export function CategoryPicker({ id, value, onChange, disabled, depth = 0, kind, allowEmpty }: PickerProps & { kind: CategoryKind; allowEmpty: boolean }) {
  const categories = useCategories();
  const archive = useArchiveCategory();
  return (
    <ManagedPicker
      id={id}
      value={value}
      options={categoryOptions(categories, kind, value)}
      placeholder="Choose a category"
      emptyLabel={allowEmpty ? "No category" : undefined}
      disabled={disabled}
      noun="category"
      depth={depth}
      archived={categories.filter((category) => category.archivedAt !== null && category.kind === kind).map((category) => ({ id: category.id, label: category.name }))}
      onRestore={(archivedId) => archive.mutate({ id: archivedId, restore: true }, { onSuccess: (restored) => onChange(restored.id) })}
      onChange={onChange}
      renderForm={(name) => <CategoryForm inline depth={depth + 1} category={null} initialName={name} initialKind={kind} />}
    />
  );
}

/** `exceptId` is the account of the transaction. A transfer goes to a different account. */
export function AccountPicker({ id, value, onChange, disabled, depth = 0, exceptId, kind, emptyLabel }: PickerProps & { exceptId?: string; kind?: AccountKind; emptyLabel?: string }) {
  const accounts = useAccounts().filter((account) => account.id !== exceptId && (kind === undefined || account.kind === kind));
  const archive = useArchiveAccount();
  return (
    <ManagedPicker
      id={id}
      value={value}
      options={accounts.filter((account) => account.archivedAt === null || account.id === value).map((account) => ({ id: account.id, label: accountOptionLabel(account) }))}
      placeholder={emptyLabel ?? "Choose an account"}
      emptyLabel={emptyLabel}
      disabled={disabled}
      noun="account"
      depth={depth}
      archived={accounts.filter((account) => account.archivedAt !== null).map((account) => ({ id: account.id, label: accountLabel(account) }))}
      onRestore={(archivedId) => archive.mutate({ id: archivedId, restore: true }, { onSuccess: (restored) => onChange(restored.id) })}
      onChange={onChange}
      renderForm={(name) => <AccountForm inline account={null} initialName={name} initialKind={kind} />}
    />
  );
}

/** `payee` is the description. The form for a new merchant starts with the name that the description gives. */
export function MerchantPicker({ id, value, onChange, disabled, depth = 0, payee }: PickerProps & { payee: string }) {
  const { merchantOptions, archivedMerchants } = merchantOptionLists(useMerchants(), value);
  const archive = useArchiveMerchant();
  return (
    <ManagedPicker
      id={id}
      value={value}
      options={merchantOptions}
      placeholder="No merchant"
      emptyLabel="No merchant"
      disabled={disabled}
      noun="merchant"
      depth={depth}
      suggestedName={merchantNameFromPayee(payee)}
      archived={archivedMerchants}
      onRestore={(archivedId) => archive.mutate({ id: archivedId, restore: true }, { onSuccess: (restored) => onChange(restored.id) })}
      onChange={onChange}
      renderForm={(name) => <MerchantForm inline depth={depth + 1} merchant={null} initialName={name} />}
    />
  );
}
