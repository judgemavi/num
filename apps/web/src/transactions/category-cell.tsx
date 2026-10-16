import { ReviewPill } from "@/transactions/review-pill";

/** The Category column: the label, the review pill and the merchant. */
export function CategoryCell({ label, review, merchant }: { label: string; review: string | null; merchant: string | null }) {
  return (
    <>
      <div className="flex items-center gap-1">
        <span className="min-w-0 truncate">{label}</span>
        <ReviewPill text={review} />
      </div>
      {merchant ? <div className="text-muted-foreground">{merchant}</div> : null}
    </>
  );
}
