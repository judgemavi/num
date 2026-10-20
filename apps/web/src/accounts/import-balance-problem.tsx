import { useBookCurrency } from "@/editors/lookups";
import { formatMoney } from "@/money";

/** The line of an import that broke the match with the bank. `difference` is the cleared balance minus the bank's balance. */
export function ImportBalanceProblem({ difference }: { difference: number }) {
  const currency = useBookCurrency();
  return (
    <p className="text-sm text-attn" role="alert">
      Num matched the bank before this import. Now it is off by {formatMoney(currency, Math.abs(difference))}.
    </p>
  );
}
