import type { TransactionListItem } from "@num/shared";
import { Badge } from "@/components/ui/badge";
import { levelLabel, plainReason } from "@/transactions/format";
import { useAccountLabels, useMerchantNames } from "@/editors/lookups";
import { useTargetText } from "@/transactions/names";
import { ReviewAnswers } from "@/transactions/review-answers";

function questionText(row: TransactionListItem) {
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

/** The proposed answer for a suggestion. It shows nothing when the row has no suggestion to propose. */
function Proposal({ row }: { row: TransactionListItem }) {
  const accounts = useAccountLabels();
  const merchants = useMerchantNames();
  const targetText = useTargetText();
  const review = row.review;
  const suggestion = review?.suggestion;
  const proposes = review && review.level !== "sure" && review.question === "categorize" && suggestion;
  if (!proposes || !(suggestion.categoryId || suggestion.transferAccountId)) {
    return null;
  }
  if (suggestion.mortgage && suggestion.transferAccountId) {
    return <span>{`Mortgage payment · ${accounts.get(suggestion.transferAccountId) ?? "your mortgage"}?`}</span>;
  }
  const merchant = merchants.get(suggestion.merchantId ?? "");
  const label = targetText(suggestion);
  return <span>{`${suggestion.transferAccountId || !merchant ? label : `${label} · ${merchant}`}?`}</span>;
}

function reasonText(row: TransactionListItem) {
  const review = row.review;
  const suggestionReason = review?.suggestion?.reason;
  return plainReason({
    reason: review ? (review.reason ?? (suggestionReason && suggestionReason !== "none" ? suggestionReason : null)) : row.autoReason,
    sourceName: review?.suggestion?.sourceName ?? row.autoSourceName,
    learnedCount: review?.learnedCount ?? row.autoLearnedCount,
    purchaseDate: row.refundOf?.date ?? null,
    purchasePayee: row.refundOf?.payeeRaw ?? null,
  });
}

/** The Review column. The level, the proposed answer, the question, the reason and the one-click answers. */
export function ReviewCell({ row }: { row: TransactionListItem }) {
  const review = row.review;
  if (review === null && row.autoReason === null) {
    return null;
  }
  const isQuestion = review !== null && review.question !== "categorize";
  const level = review ? review.level : "sure";
  const question = questionText(row);
  const reason = reasonText(row);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {!isQuestion && level !== "none" ? <Badge variant="neutral">{levelLabel(level)}</Badge> : null}
        <Proposal row={row} />
      </div>
      {question ? <div className="text-muted-foreground">{question}</div> : null}
      {reason ? <div className="text-sm text-muted-foreground">{reason}</div> : null}
      <div className="mt-1 flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <ReviewAnswers row={row} />
      </div>
    </>
  );
}
