import type { TransactionListItem } from "@num/shared";
import { useTargetText } from "@/transactions/names";

function labelText(row: TransactionListItem, targetText: ReturnType<typeof useTargetText>) {
  if (row.lines.length > 1) {
    return "Split";
  }
  const line = row.lines[0] ?? { categoryId: null, transferAccountId: null };
  // An automatic label with no category and no transfer is the answer "no category" (decision 0046).
  if (row.autoReason !== null && line.categoryId === null && line.transferAccountId === null) {
    return "No category";
  }
  return targetText(line);
}

/** The Category column. The label and the merchant. */
export function CategoryCell({ row }: { row: TransactionListItem }) {
  const targetText = useTargetText();
  return (
    <>
      <div>{labelText(row, targetText)}</div>
      {row.merchantName ? <div className="text-muted-foreground">{row.merchantName}</div> : null}
    </>
  );
}
