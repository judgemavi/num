import type { TransactionReview } from "@num/shared";
import { Badge } from "@/components/ui/badge";
import { levelLabel } from "@/transactions/format";

/**
 * The Status column (decision 0047). A row that needs review shows its level when it has a suggestion or an automatic
 * label, and "Needs review" when it has a question or no suggestion. Other rows show nothing.
 */
export function ReviewStatus({ review }: { review: TransactionReview | null }) {
  if (review === null) {
    return null;
  }
  const level = review.question === "categorize" ? review.level : "none";
  return <Badge variant={level === "none" ? "attention" : "neutral"}>{level === "none" ? "Needs review" : levelLabel(level)}</Badge>;
}
