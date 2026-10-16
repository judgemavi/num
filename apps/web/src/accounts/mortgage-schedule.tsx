import { formatCalendarDate } from "@/date-format";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useDeferredValue, type ReactNode } from "react";
import { mortgageScheduleQuery } from "@/api/mortgage";
import { localAsOf } from "@/as-of";
import { Boundary } from "@/components/boundary";
import { ListRow, listName } from "@/components/list-card";
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

/** The rows of the payment schedule in one year. It loads them by itself. */
export function MortgageSchedule({ accountId, year }: { accountId: string; year: number }) {
  return (
    <Boundary look="rows" loading="Loading the payment schedule." failed="The payment schedule did not load." resetKey={String(year)}>
      <ScheduleRows accountId={accountId} year={year} />
    </Boundary>
  );
}

function ScheduleRows({ accountId, year }: { accountId: string; year: number }) {
  const currency = useBookCurrency();
  const asOf = localAsOf();
  // The rows on the screen stay while the rows of a new year load.
  const { data: rows } = useSuspenseQuery(mortgageScheduleQuery(accountId, asOf, useDeferredValue(year)));
  return rows.map((item) => {
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
  });
}
