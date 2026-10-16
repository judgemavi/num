import { formatCalendarDate } from "@/date-format";
import {
  matchMortgageActuals,
  type MortgageActualPayment,
  type MortgageScheduleMatch,
  type ScheduledMortgagePayment,
} from "@num/shared";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { localAsOf } from "@/as-of";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { useBookCurrency } from "@/editors/lookups";
import { formatMoney } from "@/money";

function formatDay(iso: string) {
  return formatCalendarDate(iso, { month: "short", day: "numeric", year: "numeric" });
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="w-28 text-right text-sm tabular-nums max-md:w-auto max-md:flex-1 max-md:text-left">
      <small className="block text-[13px] font-normal text-muted-foreground">{label}</small>
      {children}
    </span>
  );
}

function ScheduleRow({ item, past }: { item: MortgageScheduleMatch; past: boolean }) {
  const currency = useBookCurrency();
  const row = item.scheduled;
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

export function MortgageSchedule({ payments, actuals }: { payments: ScheduledMortgagePayment[]; actuals: MortgageActualPayment[] }) {
  const asOf = localAsOf();
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
                <ScheduleRow key={item.actual && item.scheduled === null ? item.actual.id : item.date} item={item} past={item.date <= asOf} />
              ))}
            </CollapsibleContent>
          </ListCard>
        </Collapsible>
      ))}
    </div>
  );
}
