import { accountClass, accountKinds, type Account, type AccountKind } from "@num/shared";
import type { Hue } from "@/components/hue";

export const groupOrder = ["cash", "savings", "investments", "loans"] as const;

export type AccountGroupId = (typeof groupOrder)[number];

export const groupLabel: Record<AccountGroupId, string> = {
  cash: "Cash & cards",
  savings: "Savings",
  investments: "Investments & property",
  loans: "Loans & mortgage",
};

export const groupHue: Record<AccountGroupId, Hue> = {
  cash: "sky",
  savings: "mint",
  investments: "butter",
  loans: "lilac",
};

export function sameClassKinds(kind: AccountKind): AccountKind[] {
  const current = accountClass(kind);
  return accountKinds.filter((item) => accountClass(item) === current);
}

export function accountGroup(kind: AccountKind): AccountGroupId {
  switch (kind) {
    case "chequing":
    case "cash":
    case "credit_card":
      return "cash";
    case "savings":
      return "savings";
    case "investment":
    case "property":
    case "receivable":
    case "other_asset":
      return "investments";
    case "mortgage":
    case "loan":
    case "other_liability":
      return "loans";
  }
}

export function groupAccounts(accounts: Account[]): { id: AccountGroupId; items: Account[]; total: number }[] {
  return groupOrder
    .map((id) => {
      const items = accounts.filter((account) => accountGroup(account.kind) === id);
      const total = items.reduce((sum, account) => sum + account.balance, 0);
      return { id, items, total };
    })
    .filter((group) => group.items.length > 0);
}

export function worthOf(accounts: Account[]): { have: number; owe: number; total: number } {
  let assets = 0;
  let liabilities = 0;
  for (const account of accounts) {
    if (accountClass(account.kind) === "liability") {
      liabilities += account.balance;
    } else {
      assets += account.balance;
    }
  }
  const have = assets + (liabilities > 0 ? liabilities : 0);
  const owe = liabilities < 0 ? -liabilities : 0;
  return { have, owe, total: assets + liabilities };
}
