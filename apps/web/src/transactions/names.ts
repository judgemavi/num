import { useAccountLabels, useCategoryNames } from "@/editors/lookups";

type Target = { categoryId: string | null; transferAccountId: string | null };

/** Give the function that makes the text for the category or the transfer account of a line or a suggestion. */
export function useTargetText() {
  const accounts = useAccountLabels();
  const categories = useCategoryNames();
  return (target: Target) => {
    if (target.transferAccountId) {
      return `Transfer to ${accounts.get(target.transferAccountId) ?? "another account"}`;
    }
    return categories.get(target.categoryId ?? "") ?? "Uncategorized";
  };
}
