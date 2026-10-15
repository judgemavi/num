import type { TransactionListItem } from "@num/shared";
import { useMerchantNames } from "@/editors/lookups";
import { useTargetText } from "@/transactions/names";

/** The stored label of a row: the category, the transfer text, "Loan payment" or "No category". */
function useStoredLabel() {
  const targetText = useTargetText();
  return (row: TransactionListItem) => {
    if (row.lines.length > 1) {
      return "Loan payment";
    }
    const line = row.lines[0] ?? { categoryId: null, transferAccountId: null };
    // An automatic label with no category and no transfer is the answer "no category".
    if (row.autoReason !== null && line.categoryId === null && line.transferAccountId === null) {
      return "No category";
    }
    return targetText(line, row.amount);
  };
}

/**
 * The label and the merchant of a row. The Needs review page shows the proposed label and merchant of a suggestion or
 * of a transfer pair. Other rows show the stored label.
 */
export function useRowLabel(proposed: boolean) {
  const targetText = useTargetText();
  const storedLabel = useStoredLabel();
  const merchants = useMerchantNames();
  return (row: TransactionListItem) => {
    const review = proposed ? row.review : null;
    if (review?.question === "transfer_pair" && review.transfer) {
      return { label: targetText({ categoryId: null, transferAccountId: review.transfer.otherAccountId }, row.amount), merchant: null };
    }
    const suggestion = review?.question === "categorize" ? review.suggestion : null;
    if (suggestion) {
      return { label: suggestion.keep ? "No category" : targetText(suggestion, row.amount), merchant: merchants.get(suggestion.merchantId ?? "") ?? null };
    }
    return { label: storedLabel(row), merchant: row.merchantName };
  };
}
