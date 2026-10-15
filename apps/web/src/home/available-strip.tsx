import { useSuspenseQuery } from "@tanstack/react-query";
import { availableQuery } from "@/api/funding";
import { localAsOf } from "@/as-of";
import { Amount } from "@/components/amount";
import { HomeIllustration } from "@/components/illustrations";
import { SummaryStrip } from "@/components/summary-strip";

/**
 * One fact of the sum. On a phone the facts are a two-column sum: the label on the left (with "−" before the label of
 * a part that is taken away) and the amount on the right.
 */
function Part({ label, value, minus = false }: { label: string; value: number; minus?: boolean }) {
  return (
    <span className="grid gap-0.5 max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-3">
      <span className="text-[13px] text-muted-foreground">
        {minus ? <span className="md:hidden">− </span> : null}
        {label}
      </span>
      <Amount value={value} className="text-lg" />
    </span>
  );
}

function Minus() {
  return (
    <span className="pb-0.5 text-lg font-semibold text-muted-foreground max-md:hidden" aria-hidden="true">
      −
    </span>
  );
}

/** Available to spend: the money in the accounts, minus the saving buckets, minus the bills set aside. */
export function AvailableStrip() {
  const { data } = useSuspenseQuery(availableQuery(localAsOf()));
  return (
    <SummaryStrip
      tint="home"
      label="Available to spend"
      amount={<Amount value={data.available} hero />}
      below={
        <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2 max-md:grid max-md:gap-1">
          <Part label="In your accounts" value={data.onBudgetTotal} />
          <Minus />
          <Part label="Saving buckets" value={data.savings} minus />
          <Minus />
          <Part label="Set aside for bills" value={data.billsSetAside} minus />
        </div>
      }
      illustration={<HomeIllustration />}
    />
  );
}
