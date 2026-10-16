import { accountClass, accountKinds, type Account, type AccountKind } from "@num/shared";
import type { Hue } from "@/components/hue";

const groupOrder = ["cash", "assets", "liabilities"] as const;

export type AccountGroupId = (typeof groupOrder)[number];

export const groupLabel: Record<AccountGroupId, string> = {
  cash: "Cash",
  assets: "Assets",
  liabilities: "Liabilities",
};

export const groupHue: Record<AccountGroupId, Hue> = {
  cash: "sky",
  assets: "butter",
  liabilities: "lilac",
};

export function sameClassKinds(kind: AccountKind): AccountKind[] {
  const current = accountClass(kind);
  return accountKinds.filter((item) => accountClass(item) === current);
}

function accountGroup(kind: AccountKind): AccountGroupId {
  switch (kind) {
    case "chequing":
    case "savings":
    case "cash":
      return "cash";
    case "investment":
    case "property":
    case "receivable":
    case "other_asset":
      return "assets";
    case "credit_card":
    case "mortgage":
    case "loan":
    case "other_liability":
      return "liabilities";
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
