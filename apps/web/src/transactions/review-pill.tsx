import { Badge } from "@/components/ui/badge";
import type { reviewText } from "@/transactions/format";

/** The review text uses the same status tone in the table and the editor. */
export function ReviewPill({ review }: { review: ReturnType<typeof reviewText> }) {
  return review ? <Badge variant={review.tone}>{review.text}</Badge> : null;
}
