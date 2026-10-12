import { transactionSchema, type Plan, type TransactionListItem } from "@num/shared";
import { localAsOf } from "@/as-of";
import { Button } from "@/components/ui/button";
import { useEditors } from "@/editors/editor-api";
import { apiRequest } from "@/request";
import { refundPurchaseLabel } from "@/transactions/format";
import { acceptPair, applyInboxGroup, decideItem, linkOccurrence, linkRefund, updatePlanAmount } from "@/review/actions";

type Run = (action: () => Promise<{ ok: boolean }>) => Promise<void>;

type Props = {
  row: TransactionListItem;
  currency: string;
  pending: boolean;
  planById: Map<string, Plan>;
  run: Run;
};

function looksRight(id: string) {
  return apiRequest(`/api/transactions/${id}/looks-right`, transactionSchema, { method: "POST" });
}

/** The one-click answers in the Category cell. */
export function ReviewAnswers({ row, currency, pending, planById, run }: Props) {
  const { openEditor } = useEditors();
  const review = row.review;
  if (!review) {
    return row.autoReason ? (
      <Button type="button" size="sm" disabled={pending} onClick={() => void run(() => looksRight(row.id))}>
        Looks right
      </Button>
    ) : null;
  }
  const asOf = localAsOf();
  if (review.question === "transfer_pair" && review.transfer && review.itemKey) {
    const { otherId } = review.transfer;
    const itemKey = review.itemKey;
    return (
      <>
        <Button type="button" size="sm" disabled={pending} onClick={() => void run(() => acceptPair(asOf, row.id, otherId))}>
          Yes, a transfer
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => void run(() => decideItem(asOf, itemKey, "not_transfer"))}>
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
          <Button key={purchase.id} type="button" size="sm" disabled={pending} onClick={() => void run(() => linkRefund(row.id, purchase.id))}>
            {refundPurchaseLabel(currency, purchase.payeeRaw, purchase.date, purchase.amount)}
          </Button>
        ))}
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => void run(() => decideItem(asOf, itemKey, "not_linked"))}>
          Not linked to a purchase
        </Button>
      </>
    );
  }
  if (review.question === "recurring_changed" && review.recurring && review.itemKey) {
    const plan = planById.get(review.recurring.planId);
    const actual = review.recurring.actualAmount;
    const itemKey = review.itemKey;
    return (
      <>
        <Button
          type="button"
          size="sm"
          disabled={pending || !plan || actual === null}
          onClick={() => {
            if (plan && actual !== null) {
              void run(() => updatePlanAmount(plan, actual));
            }
          }}
        >
          Update the plan
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => void run(() => decideItem(asOf, itemKey, "keep_plan_amount"))}>
          Keep the recurring amount
        </Button>
      </>
    );
  }
  if (review.question === "recurring_ambiguous" && review.recurring) {
    const { planId, dueDate } = review.recurring;
    return (
      <Button type="button" size="sm" disabled={pending} onClick={() => void run(() => linkOccurrence(planId, dueDate, row.id))}>
        Link this payment
      </Button>
    );
  }
  if (review.level === "sure") {
    return (
      <Button type="button" size="sm" disabled={pending} onClick={() => void run(() => looksRight(row.id))}>
        Looks right
      </Button>
    );
  }
  const suggestion = review.suggestion;
  if (suggestion && (suggestion.categoryId || suggestion.transferAccountId)) {
    return (
      <Button type="button" size="sm" disabled={pending} onClick={() => void run(() => applyInboxGroup(row.accountId, [row.id], suggestion))}>
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
