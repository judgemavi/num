type NamedAccount = {
  name: string;
  institution?: string | null;
};

/** Spec §5.1. The browser builds the display name. The API returns the raw fields. */
export function accountLabel(account: NamedAccount): string {
  const institution = account.institution?.trim() ?? "";
  if (institution.length === 0) {
    return account.name;
  }
  if (account.name.toLocaleLowerCase().startsWith(institution.toLocaleLowerCase())) {
    return account.name;
  }
  return `${institution} ${account.name}`;
}

export function accountOptionLabel(account: NamedAccount & { archivedAt?: string | null }): string {
  const label = accountLabel(account);
  return account.archivedAt ? `${label} (archived)` : label;
}

export function accountLabels(accounts: (NamedAccount & { id: string })[]): Map<string, string> {
  return new Map(accounts.map((account) => [account.id, accountLabel(account)]));
}

export function accountLabelOf(accounts: (NamedAccount & { id: string })[], id: string, fallback: string): string {
  return accountLabels(accounts).get(id) ?? fallback;
}
