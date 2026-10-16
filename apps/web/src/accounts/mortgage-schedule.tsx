import { formatCalendarDate } from "@/date-format";
import { Temporal } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useDeferredValue, useState, type ReactNode } from "react";
import { mortgageScheduleQuery } from "@/api/mortgage";
import { localAsOf } from "@/as-of";
import { Boundary } from "@/components/boundary";
import { ChoiceSelect } from "@/components/choice-select";
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

const title = "Payment schedule";

function yearOptions({ first, last }: { first: number; last: number }) {
  return Array.from({ length: last - first + 1 }, (_, index) => ({ value: String(first + index), label: String(first + index) }));
}

/** The payment schedule of a mortgage, one year at a time. It loads by itself. */
export function MortgageSchedule({ accountId }: { accountId: string }) {
  return (
    <Boundary
      look="rows"
      loading="Loading the payment schedule."
      failed="The payment schedule did not load."
      frame={(content) => <ListCard label={title} title={title}>{content}</ListCard>}
    >
      <ScheduleCard accountId={accountId} />
    </Boundary>
  );
}

function ScheduleCard({ accountId }: { accountId: string }) {
  const currency = useBookCurrency();
  const asOf = localAsOf();
  const [chosenYear, setChosenYear] = useState(() => Temporal.PlainDate.from(asOf).year);
  // The rows on the screen stay while the rows of a new year load.
  const { data: schedule } = useSuspenseQuery(mortgageScheduleQuery(accountId, asOf, useDeferredValue(chosenYear)));
  if (!schedule) {
    return null;
  }
  if (!schedule.years) {
    return <p className="text-sm text-muted-foreground">No payments remain.</p>;
  }
  return (
    <ListCard
      label={title}
      title={title}
      actions={
        <ChoiceSelect
          aria-label="Year"
          className="w-28"
          value={String(schedule.year)}
          options={yearOptions(schedule.years)}
          onValueChange={(year) => setChosenYear(Number(year))}
        />
      }
    >
      {schedule.rows.map((item) => {
        const row = item.scheduled;
        return (
          <ListRow key={item.actual && row === null ? item.actual.id : item.date}>
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
            {item.date <= asOf ? <Cell label="Paid">{item.actual ? formatMoney(currency, item.actual.amount) : "No payment"}</Cell> : null}
          </ListRow>
        );
      })}
    </ListCard>
  );
}
