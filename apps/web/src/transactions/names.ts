import { moneyDirection } from "@num/shared";
import { useAccountLabels, useCategoryNames } from "@/editors/lookups";

type Target = { categoryId: string | null; transferAccountId: string | null };

/**
 * Give the function that makes the text for the category or the transfer account of a line or a suggestion. The
 * amount of the transaction gives the direction of a transfer: "Transfer to" for money out, "Transfer from" for money in.
 */
export function useTargetText() {
  const accounts = useAccountLabels();
  const categories = useCategoryNames();
  return (target: Target, amount: number) => {
    if (target.transferAccountId) {
      const account = accounts.get(target.transferAccountId) ?? "another account";
      return moneyDirection(amount) === "in" ? `Transfer from ${account}` : `Transfer to ${account}`;
    }
    return categories.get(target.categoryId ?? "") ?? "Uncategorized";
  };
}
