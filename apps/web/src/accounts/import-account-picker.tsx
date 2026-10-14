import { useSuspenseQuery } from "@tanstack/react-query";
import { activeAccountsQuery } from "@/api/accounts";
import { useImportAccount } from "@/accounts/import-account";
import { accountLabel } from "@/accounts/label";
import { OptionCombobox } from "@/transactions/option-combobox";

type ImportAccountPickerProps = {
  id: string;
  value: string | null;
  /** The account that the editor opened for. The picker shows it also when it is archived. */
  editorAccountId: string | null;
  disabled: boolean;
  onChange: (accountId: string | null) => void;
};

/** The picker of the account of a statement file. It shows the active accounts. The editor reads the same lists first. */
export function ImportAccountPicker({ id, value, editorAccountId, disabled, onChange }: ImportAccountPickerProps) {
  const account = useImportAccount(editorAccountId);
  const active = useSuspenseQuery(activeAccountsQuery()).data.items;
  const known = account && !active.some((item) => item.id === account.id) ? [account, ...active] : active;
  return (
    <OptionCombobox
      id={id}
      value={value}
      options={known.map((item) => ({ id: item.id, label: accountLabel(item) }))}
      placeholder="Choose an account"
      disabled={disabled}
      onChange={onChange}
    />
  );
}
