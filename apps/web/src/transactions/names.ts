export type Names = {
  categories: Map<string, string>;
  accounts: Map<string, string>;
  merchants: Map<string, string>;
};

type Target = { categoryId: string | null; transferAccountId: string | null };

export function targetText(target: Target, names: Names): string {
  if (target.transferAccountId) {
    return `Transfer to ${names.accounts.get(target.transferAccountId) ?? "another account"}`;
  }
  if (target.categoryId) {
    return names.categories.get(target.categoryId) ?? "Uncategorized";
  }
  return "Uncategorized";
}
