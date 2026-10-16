import { useOptionalQuery } from "@/api/optional-query";
import { transactionReviewQuery } from "@/api/transactions";
import { localAsOf } from "@/as-of";
import { useBookCurrency } from "@/editors/lookups";
import { signedTotal, useSuggestion, type TransactionValues } from "@/transactions/transaction-draft";

export function useDraftReview(id: string | null) {
  return useOptionalQuery(id, (key) => transactionReviewQuery(key, localAsOf()));
}

/** Use the debounced values only while they still match the current fields. */
export function useDraftSuggestion(values: TransactionValues, storedAmount: number | null) {
  const currency = useBookCurrency();
  return useSuggestion(
    { accountId: values.accountId, payee: values.suggestionPayee, date: values.date, direction: values.direction,
      amount: signedTotal(currency, storedAmount, values.suggestionAmount, values.direction) },
    values.payee === values.suggestionPayee && values.amount === values.suggestionAmount,
  );
}
