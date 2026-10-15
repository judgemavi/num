import type { TransactionReview } from "@num/shared";
import { Badge } from "@/components/ui/badge";
import { levelLabel } from "@/transactions/format";

/**
 * The Status column of the All page. A row that needs review shows its level when it has a suggestion
 * or an automatic label, and "Needs review" when it has a question or no suggestion. Other rows show nothing.
 */
export function ReviewStatus({ review }: { review: TransactionReview | null }) {
  if (review === null) {
    return null;
  }
  const level = review.question === "categorize" ? review.level : "none";
  return <Badge variant={level === "none" ? "attention" : "neutral"}>{level === "none" ? "Needs review" : levelLabel(level)}</Badge>;
}

/**
 * The Confidence column of the Needs review page. A question shows "Question". A row with a suggestion
 * or an automatic label shows its level. A row with no suggestion shows nothing.
 */
export function ReviewConfidence({ review }: { review: TransactionReview | null }) {
  if (review === null) {
    return null;
  }
  if (review.question !== "categorize") {
    return <Badge variant="neutral">Question</Badge>;
  }
  return review.level === "none" ? null : <Badge variant="neutral">{levelLabel(review.level)}</Badge>;
}
