/** The Category column: the label and the merchant. */
export function CategoryCell({ label, merchant }: { label: string; merchant: string | null }) {
  return (
    <>
      <div>{label}</div>
      {merchant ? <div className="text-muted-foreground">{merchant}</div> : null}
    </>
  );
}
