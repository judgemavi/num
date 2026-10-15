import { useSuspenseQuery } from "@tanstack/react-query";
import { availableQuery } from "@/api/funding";
import { localAsOf } from "@/as-of";
import { Amount } from "@/components/amount";
import { HomeIllustration } from "@/components/illustrations";
import { SummaryStrip } from "@/components/summary-strip";

function Part({ label, value }: { label: string; value: number }) {
  return (
    <span className="grid gap-0.5">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <Amount value={value} className="text-lg" />
    </span>
  );
}

function Minus() {
  return (
    <span className="pb-0.5 text-lg font-semibold text-muted-foreground" aria-hidden="true">
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
        <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2">
          <Part label="In your accounts" value={data.onBudgetTotal} />
          <Minus />
          <Part label="Saving buckets" value={data.savings} />
          <Minus />
          <Part label="Set aside for bills" value={data.billsSetAside} />
        </div>
      }
      illustration={<HomeIllustration />}
    />
  );
}
