import { matchMortgageActuals, Temporal, type MortgageActualPayment, type ScheduledMortgagePayment } from "@num/shared";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { formatMoney } from "@/money";

function formatDay(iso: string): string {
  return Temporal.PlainDate.from(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
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
  const years = new Map<string, typeof rows>();
  for (const row of rows) {
    const year = row.date.slice(0, 4);
    const list = years.get(year) ?? [];
    list.push(row);
    years.set(year, list);
  }
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No payments remain.</p>;
  }
  return (
    <div className="grid gap-4">
      <p className="text-sm font-semibold">Payment schedule</p>
      {[...years.entries()].map(([year, items]) => (
        <ListCard key={year} label={year} title={year}>
          {items.map((item) => (
            <ListRow key={item.actual && item.scheduled === null ? item.actual.id : item.date} simple>
              <div className={listName}>
                {formatDay(item.date)}
                <small>{item.scheduled ? `Scheduled ${formatMoney(currency, item.scheduled.payment)}` : "Extra payment"}</small>
              </div>
              <span className="text-sm tabular-nums">
                {item.actual ? formatMoney(currency, item.actual.amount) : item.date <= asOf ? "No payment" : ""}
              </span>
            </ListRow>
          ))}
        </ListCard>
      ))}
    </div>
  );
}
