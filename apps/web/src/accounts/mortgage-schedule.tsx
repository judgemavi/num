import {
  matchMortgageActuals,
  Temporal,
  type MortgageActualPayment,
  type MortgageScheduleMatch,
  type ScheduledMortgagePayment,
} from "@num/shared";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { formatMoney } from "@/money";

function formatDay(iso: string): string {
  return Temporal.PlainDate.from(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="w-28 text-right text-sm tabular-nums max-md:w-auto max-md:flex-1 max-md:text-left">
      <small className="block text-[13px] font-normal text-muted-foreground">{label}</small>
      {children}
    </span>
  );
}

function ScheduleRow({ item, currency, asOf }: { item: MortgageScheduleMatch; currency: string; asOf: string }) {
  const row = item.scheduled;
  const past = item.date <= asOf;
  return (
    <ListRow>
      <div className={listName}>
        {formatDay(item.date)}
        {row ? null : <small>Extra payment</small>}
      </div>
      {row ? <Cell label="Payment">{formatMoney(currency, row.payment)}</Cell> : null}
      {row ? (
        <div className="contents max-md:flex max-md:basis-full max-md:gap-3">
          <Cell label="Interest">{formatMoney(currency, row.interest)}</Cell>
          <Cell label="Principal">{formatMoney(currency, row.principal)}</Cell>
        </div>
      ) : null}
      {row ? <Cell label="Balance">{formatMoney(currency, row.balance)}</Cell> : null}
      {past ? (
        <Cell label="Paid">{item.actual ? formatMoney(currency, item.actual.amount) : "No payment"}</Cell>
      ) : null}
    </ListRow>
  );
}

export function MortgageSchedule({
  currency,
  asOf,
  payments,
  actuals,
}: {
  currency: string;
  asOf: string;
  payments: ScheduledMortgagePayment[];
  actuals: MortgageActualPayment[];
}) {
  const rows = matchMortgageActuals(payments, actuals, asOf);
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No payments remain.</p>;
  }
  const years = new Map<string, MortgageScheduleMatch[]>();
  for (const row of rows) {
    const year = row.date.slice(0, 4);
    years.set(year, [...(years.get(year) ?? []), row]);
  }
  const currentYear = asOf.slice(0, 4);
  return (
    <div className="grid gap-4">
      <p className="text-sm font-semibold">Payment schedule</p>
      {[...years.entries()].map(([year, items]) => (
        <Collapsible key={year} defaultOpen={year >= currentYear}>
          <ListCard
            label={year}
            title={year}
            actions={
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="group" aria-label={`Show or hide the payments of ${year}`}>
                  <ChevronRight className="size-5 transition-transform group-data-[state=open]:rotate-90" aria-hidden="true" strokeWidth={1.8} />
                </Button>
              </CollapsibleTrigger>
            }
          >
            <CollapsibleContent>
              {items.map((item) => (
                <ScheduleRow key={item.actual && item.scheduled === null ? item.actual.id : item.date} item={item} currency={currency} asOf={asOf} />
              ))}
            </CollapsibleContent>
          </ListCard>
        </Collapsible>
      ))}
    </div>
  );
}
