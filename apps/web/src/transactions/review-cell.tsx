import type { Plan, TransactionListItem } from "@num/shared";
import { Badge } from "@/components/ui/badge";
import { levelLabel, plainReason } from "@/transactions/format";
import { targetText, type Names } from "@/transactions/names";
import { ReviewAnswers } from "@/transactions/review-answers";

function questionText(row: TransactionListItem): string | null {
  const review = row.review;
  if (!review) {
    return null;
  }
  if (review.question === "transfer_pair" && review.transfer) {
    return `Transfer with ${review.transfer.otherPayee}?`;
  }
  if (review.question === "recurring_ambiguous") {
    return "Which payment is this?";
  }
  if (review.question === "refund_purchase") {
    return "Refund of which purchase?";
  }
  if (review.question === "recurring_changed" && review.recurring?.actualAmount !== null && review.recurring?.expectedAmount !== null) {
    return "The amount changed. Update the plan?";
  }
  return null;
}

/** The proposed answer for a suggestion, or null. */
function proposalText(row: TransactionListItem, names: Names): string | null {
  const review = row.review;
  const suggestion = review?.suggestion;
  const proposes = review && review.level !== "sure" && review.question === "categorize" && suggestion;
  if (!proposes || !(suggestion.categoryId || suggestion.transferAccountId)) {
    return null;
  }
  const merchant = suggestion.merchantId ? names.merchants.get(suggestion.merchantId) : undefined;
  const label = targetText(suggestion, names);
  return `${suggestion.transferAccountId || !merchant ? label : `${label} · ${merchant}`}?`;
}

function reasonText(row: TransactionListItem): string {
  const review = row.review;
  const suggestionReason = review?.suggestion?.reason;
  return plainReason({
    reason: review ? (review.reason ?? (suggestionReason && suggestionReason !== "none" ? suggestionReason : null)) : row.autoReason,
    sourceName: row.autoSourceName,
    learnedCount: review?.learnedCount ?? row.autoLearnedCount,
    purchaseDate: row.refundOf?.date ?? null,
    purchasePayee: row.refundOf?.payeeRaw ?? null,
  });
}

type Props = {
  row: TransactionListItem;
  currency: string;
  names: Names;
  pending: boolean;
  planById: Map<string, Plan>;
  run: (action: () => Promise<{ ok: boolean }>) => Promise<void>;
};

/** The Review column. The level, the proposed answer, the question, the reason and the one-click answers. */
export function ReviewCell({ row, currency, names, pending, planById, run }: Props) {
  const review = row.review;
  if (review === null && row.autoReason === null) {
    return null;
  }
  const isQuestion = review !== null && review.question !== "categorize";
  const level = review ? review.level : "sure";
  const proposal = proposalText(row, names);
  const question = questionText(row);
  const reason = reasonText(row);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {!isQuestion && level !== "none" ? <Badge variant="neutral">{levelLabel(level)}</Badge> : null}
        {proposal ? <span>{proposal}</span> : null}
      </div>
      {question ? <div className="text-muted-foreground">{question}</div> : null}
      {reason ? <div className="text-sm text-muted-foreground">{reason}</div> : null}
      <div className="mt-1 flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <ReviewAnswers row={row} currency={currency} pending={pending} planById={planById} run={run} />
      </div>
    </>
  );
}
