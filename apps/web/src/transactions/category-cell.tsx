import type { TransactionListItem } from "@num/shared";
import { useMerchantNames } from "@/editors/lookups";
import { useTargetText } from "@/transactions/names";

function labelText(row: TransactionListItem, targetText: ReturnType<typeof useTargetText>) {
  if (row.lines.length > 1) {
    return "Loan payment";
  }
  const line = row.lines[0] ?? { categoryId: null, transferAccountId: null };
  // An automatic label with no category and no transfer is the answer "no category" (decision 0046).
  if (row.autoReason !== null && line.categoryId === null && line.transferAccountId === null) {
    return "No category";
  }
  return targetText(line, row.amount);
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

/**
 * The Category column of the Needs review page (decision 0048). A suggestion or a transfer pair shows the proposed
 * label and merchant. Other rows show the stored label, as on the All page.
 */
export function ProposedCategoryCell({ row }: { row: TransactionListItem }) {
  const targetText = useTargetText();
  const merchants = useMerchantNames();
  const review = row.review;
  if (review?.question === "transfer_pair" && review.transfer) {
    return <div>{targetText({ categoryId: null, transferAccountId: review.transfer.otherAccountId }, row.amount)}</div>;
  }
  const suggestion = review?.question === "categorize" ? review.suggestion : null;
  if (!suggestion) {
    return <CategoryCell row={row} />;
  }
  const merchant = merchants.get(suggestion.merchantId ?? "");
  return (
    <>
      <div>{suggestion.keep ? "No category" : targetText(suggestion, row.amount)}</div>
      {merchant ? <div className="text-muted-foreground">{merchant}</div> : null}
    </>
  );
}
