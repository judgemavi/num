/** The Category column: the label, the review text (muted) and the merchant. */
export function CategoryCell({ label, review, merchant }: { label: string; review: string | null; merchant: string | null }) {
  return (
    <>
      <div className="flex gap-1">
        <span className="truncate">{label}</span>
        {review ? <span className="shrink-0 text-muted-foreground">· {review}</span> : null}
      </div>
      {merchant ? <div className="text-muted-foreground">{merchant}</div> : null}
    </>
  );
}
