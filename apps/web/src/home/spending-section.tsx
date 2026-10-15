import { Temporal, type ErrorCode } from "@num/shared";
import { errorCode } from "@/api/client";
import { localAsOf } from "@/as-of";
import { Boundary } from "@/components/boundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBookCurrency, useCategoryNames } from "@/editors/lookups";
import { monthTitle, rateText } from "@/insights/format";
import { SelectedSpendList, SpendDonutCard } from "@/insights/insights-breakdown";
import { PeriodSelect } from "@/insights/period-select";
import { TimelineChart } from "@/insights/timeline-chart";
import { useInsightsReport } from "@/insights/use-report";
import { formatMoney } from "@/money";

const errorText: Partial<Record<ErrorCode, string>> = {
  period_invalid: "The start date is after the end date, or the month is not in the period.",
  category_not_found: "That category is not in the book.",
  as_of_invalid: "The date is not valid.",
};

function shortMonth(iso: string) {
  return Temporal.PlainDate.from(iso).toLocaleString(undefined, { month: "short", year: "numeric" });
}

/** The name of the breakdown range: one month (with the year when it is not this year), or the first and the last month. */
function rangeName(from: string, to: string) {
  if (from.slice(0, 7) === to.slice(0, 7)) {
    const sameYear = from.slice(0, 4) === localAsOf().slice(0, 4);
    return sameYear ? Temporal.PlainDate.from(from).toLocaleString(undefined, { month: "long" }) : monthTitle(from.slice(0, 7));
  }
  return `${shortMonth(from)} – ${shortMonth(to)}`;
}

/** One muted line: the range, the spending of the income and the savings rate. It follows the selected period. */
function SpendingLine() {
  const currency = useBookCurrency();
  const { data } = useInsightsReport();
  const parts = [rangeName(data.range.from, data.range.to), `${formatMoney(currency, data.spending)} spent of ${formatMoney(currency, data.income)} income`];
  if (data.savingsRateMilliPct !== null) {
    parts.push(`${rateText(data.savingsRateMilliPct)} saved`);
  }
  return <p className="text-sm text-muted-foreground">{parts.join(" · ")}</p>;
}

function TimelineCard() {
  const { search, patchSearch } = useInsightsReport();
  const categoryName = useCategoryNames().get(search.category ?? "");
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 px-5 pt-5 md:px-6">
        <CardTitle className="text-base font-bold">{categoryName ? `${categoryName} spending` : "Income, spending and balance"}</CardTitle>
        {search.category ? (
          <Button type="button" variant="ghost" onClick={() => patchSearch({ category: undefined })}>
            Show all
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3 px-5 pb-5 md:px-6">
        <TimelineChart />
      </CardContent>
    </Card>
  );
}

/**
 * Spending on Home: the period (default this month), the timeline, the spending donut and the list of groups and
 * categories. The period selector stays outside the boundary, thus the person can change a period that does not load.
 */
export function SpendingSection() {
  return (
    <section aria-labelledby="home-spending" className="grid gap-5">
      <div className="grid gap-1.5">
        <h2 id="home-spending" className="font-display text-[28px] leading-none font-extrabold uppercase [font-stretch:72%]">
          Spending
        </h2>
        <Boundary loading={null} failed={() => null}>
          <SpendingLine />
        </Boundary>
      </div>
      <PeriodSelect />
      <Boundary
        loading="Loading spending."
        failed={({ error }) => {
          const code = errorCode(error);
          return (code && errorText[code]) ?? "Spending did not load.";
        }}
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <TimelineCard />
          <SpendDonutCard />
        </div>
        <SelectedSpendList />
      </Boundary>
    </section>
  );
}
