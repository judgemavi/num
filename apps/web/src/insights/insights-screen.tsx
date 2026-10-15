import { Temporal, type ErrorCode } from "@num/shared";
import { errorCode } from "@/api/client";
import { Amount } from "@/components/amount";
import { Boundary } from "@/components/boundary";
import { PageHeader } from "@/components/page-header";
import { Fact, SummaryStrip } from "@/components/summary-strip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBookCurrency, useCategoryNames } from "@/editors/lookups";
import { ChangesCard } from "@/insights/changes-card";
import { monthTitle, rateText } from "@/insights/format";
import { InsightsBreakdown } from "@/insights/insights-breakdown";
import { PeriodSelect } from "@/insights/period-select";
import { TimelineChart } from "@/insights/timeline-chart";
import { useInsightsReport } from "@/insights/use-report";
import { formatMoney } from "@/money";
import { ForecastChart } from "@/plan/forecast-chart";

const errorText: Partial<Record<ErrorCode, string>> = {
  period_invalid: "The start date is after the end date, or the month is not in the period.",
  category_not_found: "That category is not in the book.",
  as_of_invalid: "The date is not valid.",
};

function rangeText(from: string, to: string) {
  const start = Temporal.PlainDate.from(from).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const end = Temporal.PlainDate.from(to).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${start} to ${end}`;
}

export function InsightsScreen() {
  return (
    <>
      <PageHeader kicker="Insights" title="Spending" />
      <PeriodSelect />
      <Boundary
        loading="Loading insights."
        failed={({ error }) => {
          const code = errorCode(error);
          return (code && errorText[code]) ?? "Insights did not load.";
        }}
      >
        <SpendingSummary />
        <TimelineCard />
        <InsightsBreakdown />
        <ChangesCard />
        <NetWorthCard />
      </Boundary>
    </>
  );
}

function SpendingSummary() {
  const { data, search } = useInsightsReport();
  return (
    <SummaryStrip
      tint="plan"
      label="Spending"
      amount={<Amount value={data.spending} hero />}
      hint={search.month ? `${monthTitle(search.month)}: ${rangeText(data.range.from, data.range.to)}` : rangeText(data.range.from, data.range.to)}
      facts={
        <>
          <Fact label="Income">
            <Amount value={data.income} />
          </Fact>
          <Fact label="Saved">
            <Amount value={data.savings} />
          </Fact>
          {data.savingsRateMilliPct === null ? null : <Fact label="Savings rate">{rateText(data.savingsRateMilliPct)}</Fact>}
        </>
      }
    />
  );
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
            Show all spending
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3 px-5 pb-5 md:px-6">
        <TimelineChart />
      </CardContent>
    </Card>
  );
}

function NetWorthCard() {
  const currency = useBookCurrency();
  const { data } = useInsightsReport();
  const latest = data.netWorth.at(-1);
  const firstWorth = data.netWorth[0];
  const worthDelta = latest && firstWorth ? latest.net - firstWorth.net : 0;
  return (
    <Card>
      <CardContent className="grid gap-2 p-5 md:p-6">
        <h2 className="text-base font-bold">Net worth, 24 months</h2>
        {latest ? <Amount value={latest.net} /> : null}
        {firstWorth ? (
          <p className={`text-sm font-semibold ${worthDelta > 0 ? "text-pos" : worthDelta < 0 ? "text-attn" : ""}`}>
            {worthDelta > 0 ? "Up" : worthDelta < 0 ? "Down" : "No change"}{" "}
            {formatMoney(currency, worthDelta < 0 ? -worthDelta : worthDelta)} since {monthTitle(firstWorth.month)}.
          </p>
        ) : null}
        <ForecastChart
          label={latest ? `Net worth for 24 months. Latest ${formatMoney(currency, latest.net)}.` : "Net worth for 24 months."}
          dates={data.netWorth.map((point) => point.month)}
          series={[{ name: "Net worth", amounts: data.netWorth.map((point) => point.net) }]}
        />
      </CardContent>
    </Card>
  );
}
