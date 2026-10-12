import type { TransactionListItem } from "@num/shared";
import { targetText, type Names } from "@/transactions/names";

function currentText(row: TransactionListItem, names: Names): string {
  if (row.lines.length > 1) {
    return "Split";
  }
  return targetText(row.lines[0] ?? { categoryId: null, transferAccountId: null }, names);
}

/** The Category column. The label and the merchant. */
export function CategoryCell({ row, names }: { row: TransactionListItem; names: Names }) {
  return (
    <>
      <div>{currentText(row, names)}</div>
      {row.merchantName ? <div className="text-muted-foreground">{row.merchantName}</div> : null}
    </>
  );
}
