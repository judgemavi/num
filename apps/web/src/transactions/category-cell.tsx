import type { TransactionListItem } from "@num/shared";
import { useTargetText } from "@/transactions/names";

/** The Category column. The label and the merchant. */
export function CategoryCell({ row }: { row: TransactionListItem }) {
  const targetText = useTargetText();
  return (
    <>
      <div>{row.lines.length > 1 ? "Split" : targetText(row.lines[0] ?? { categoryId: null, transferAccountId: null })}</div>
      {row.merchantName ? <div className="text-muted-foreground">{row.merchantName}</div> : null}
    </>
  );
}
