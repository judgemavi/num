import type { TransactionListItem } from "@num/shared";
import { useIsMutating } from "@tanstack/react-query";
import { useAnswerReview } from "@/api/review";
import { useTransactionListFetching } from "@/api/transactions";
import { localAsOf } from "@/as-of";
import { Button } from "@/components/ui/button";
import { useEditors } from "@/editors/editor-api";
import { useActivePlans, useBookCurrency } from "@/editors/lookups";
import { refundPurchaseLabel } from "@/transactions/format";

/** The one-click answers in the Review cell. The row saves its own answer. */
export function ReviewAnswers({ row }: { row: TransactionListItem }) {
  const { openEditor } = useEditors();
  const currency = useBookCurrency();
  const plans = useActivePlans();
  const answer = useAnswerReview();
  const writing = useIsMutating() > 0;
  const listLoading = useTransactionListFetching();
  // The row is old from the save of its answer until the list has the new rows.
  const busy = writing || (answer.isSuccess && listLoading);
  const review = row.review;

  function buttons() {
    if (!review) {
      return row.autoReason ? (
        <Button type="button" size="sm" disabled={busy} onClick={() => answer.mutate({ kind: "looksRight", id: row.id })}>
          Looks right
        </Button>
      ) : null;
    }
    if (review.question === "transfer_pair" && review.transfer && review.itemKey) {
      const { otherId } = review.transfer;
      const itemKey = review.itemKey;
      return (
        <>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => answer.mutate({ kind: "acceptPair", asOf: localAsOf(), leftId: row.id, rightId: otherId })}
          >
            Yes, a transfer
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => answer.mutate({ kind: "decide", asOf: localAsOf(), itemKey, decision: "not_transfer" })}
          >
            Not a transfer
          </Button>
        </>
      );
    }
    if (review.question === "refund_purchase" && review.refund) {
      const itemKey = review.refund.itemKey;
      return (
        <>
          {review.refund.purchases.map((purchase) => (
            <Button
              key={purchase.id}
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => answer.mutate({ kind: "linkRefund", refundId: row.id, purchaseId: purchase.id })}
            >
              {refundPurchaseLabel(currency, purchase.payeeRaw, purchase.date, purchase.amount)}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => answer.mutate({ kind: "decide", asOf: localAsOf(), itemKey, decision: "not_linked" })}
          >
            Not linked to a purchase
          </Button>
        </>
      );
    }
    if (review.question === "recurring_changed" && review.recurring && review.itemKey) {
      const { planId, actualAmount } = review.recurring;
      const plan = plans.items.find((item) => item.id === planId);
      const itemKey = review.itemKey;
      return (
        <>
          <Button
            type="button"
            size="sm"
            disabled={busy || !plan || actualAmount === null}
            onClick={() => {
              if (plan && actualAmount !== null) {
                answer.mutate({ kind: "planAmount", plan, expectedAmount: actualAmount });
              }
            }}
          >
            Update the plan
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => answer.mutate({ kind: "decide", asOf: localAsOf(), itemKey, decision: "keep_plan_amount" })}
          >
            Keep the recurring amount
          </Button>
        </>
      );
    }
    if (review.question === "recurring_ambiguous" && review.recurring) {
      const { planId, dueDate } = review.recurring;
      return (
        <Button type="button" size="sm" disabled={busy} onClick={() => answer.mutate({ kind: "linkOccurrence", planId, dueDate, transactionId: row.id })}>
          Link this payment
        </Button>
      );
    }
    if (review.level === "sure") {
      return (
        <Button type="button" size="sm" disabled={busy} onClick={() => answer.mutate({ kind: "looksRight", id: row.id })}>
          Looks right
        </Button>
      );
    }
    const suggestion = review.suggestion;
    if (suggestion && (suggestion.categoryId || suggestion.transferAccountId)) {
      return (
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => answer.mutate({ kind: "applySuggestion", accountId: row.accountId, transactionId: row.id, suggestion })}
        >
          Yes
        </Button>
      );
    }
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => void openEditor("transaction", { id: row.id })}>
        What is this?
      </Button>
    );
  }

  return (
    <>
      {buttons()}
      {answer.isError ? (
        <p role="alert" className="basis-full">
          That answer did not save.
        </p>
      ) : null}
    </>
  );
}
