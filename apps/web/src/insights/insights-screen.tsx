import { defaultInsightWindow, Temporal, type ErrorCode, type InsightWindow, type InsightsSearch } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { errorCode } from "@/api/client";
import { insightsQuery } from "@/api/insights";
import { localAsOf } from "@/as-of";
import { Amount } from "@/components/amount";
import { PageHeader } from "@/components/page-header";
import { Fact, SummaryStrip } from "@/components/summary-strip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBookCurrency, useCategories } from "@/editors/lookups";
import { ChangesCard } from "@/insights/changes-card";
import { monthTitle, rateText } from "@/insights/format";
import { InsightsBreakdown } from "@/insights/insights-breakdown";
import { PeriodSelect } from "@/insights/period-select";
import { TimelineChart } from "@/insights/timeline-chart";
import { formatMoney } from "@/money";
import { ForecastChart } from "@/plan/forecast-chart";

const insightsRoute = getRouteApi("/insights");

const searchKeys = ["window", "from", "to", "month", "group", "category"] as const;

const errorText: Partial<Record<ErrorCode, string>> = {
  period_invalid: "The start date is after the end date, or the month is not in the period.",
  category_not_found: "That category is not in the book.",
  group_not_found: "That group is not in the book.",
  as_of_invalid: "The date is not valid.",
};

function rangeText(from: string, to: string): string {
  const start = Temporal.PlainDate.from(from).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const end = Temporal.PlainDate.from(to).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${start} to ${end}`;
}

function apiSearch(search: InsightsSearch): InsightsSearch {
  const picked: InsightsSearch = {};
  for (const key of searchKeys) {
    if (search[key] !== undefined) {
      Object.assign(picked, { [key]: search[key] });
    }
  }
  return picked;
}

export function InsightsScreen() {
  const asOf = localAsOf();
  const search = apiSearch(insightsRoute.useSearch());
  const navigateSearch = insightsRoute.useNavigate();
  const currency = useBookCurrency();
  const categories = useCategories();
  const report = useQuery(insightsQuery(asOf, search));

  const reportCode = errorCode(report.error);
  const bookCurrency = currency.data ?? "USD";
  const data = report.data;
  const latest = data?.netWorth.at(-1);
  const firstWorth = data?.netWorth[0];
  const worthDelta = latest && firstWorth ? latest.net - firstWorth.net : 0;
  const categoryName = categories.data?.find((item) => item.id === search.category)?.name ?? null;

  function patchSearch(patch: Partial<InsightsSearch>) {
    void navigateSearch({
      search: (prev) => {
        const next: Record<string, unknown> = { ...prev, ...patch };
        for (const key of searchKeys) {
          if (next[key] === undefined) {
            delete next[key];
          }
        }
        return next as typeof prev;
      },
    });
  }

  function chooseWindow(window: InsightWindow) {
    if (window === "custom") {
      patchSearch({ window, from: data?.from ?? `${asOf.slice(0, 7)}-01`, to: data?.to ?? asOf, month: undefined });
      return;
    }
    patchSearch({ window: window === defaultInsightWindow ? undefined : window, from: undefined, to: undefined, month: undefined });
  }

  return (
    <>
      <PageHeader kicker="Insights" title="Spending" />
      <PeriodSelect window={search.window} from={search.from} to={search.to} onWindow={chooseWindow} onRange={patchSearch} />
      {report.isPending ? <p className="text-muted-foreground">Loading insights.</p> : null}
      {report.isError ? (
        <div className="grid gap-3">
          <p role="alert">{(reportCode && errorText[reportCode]) ?? "Insights did not load."}</p>
          <Button type="button" onClick={() => void report.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}
      {data ? (
        <SummaryStrip
          tint="plan"
          label="Spending"
          amount={<Amount currency={bookCurrency} minor={data.spending} hero />}
          hint={search.month ? `${monthTitle(search.month)}: ${rangeText(data.range.from, data.range.to)}` : rangeText(data.range.from, data.range.to)}
          facts={
            <>
              <Fact label="Income">
                <Amount currency={bookCurrency} minor={data.income} />
              </Fact>
              <Fact label="Saved">
                <Amount currency={bookCurrency} minor={data.savings} />
              </Fact>
              {data.savingsRateMilliPct === null ? null : <Fact label="Savings rate">{rateText(data.savingsRateMilliPct)}</Fact>}
            </>
          }
        />
      ) : null}
      {data ? (
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
            <TimelineChart
              currency={bookCurrency}
              asOf={asOf}
              current={data.to === asOf}
              timeline={data.timeline}
              categoryName={categoryName}
              selectedMonth={search.month ?? null}
              onSelectMonth={(month) => patchSearch({ month: search.month === month ? undefined : month })}
            />
          </CardContent>
        </Card>
      ) : null}
      {data ? <InsightsBreakdown currency={bookCurrency} data={data} search={search} patchSearch={patchSearch} /> : null}
      {data ? <ChangesCard currency={bookCurrency} changes={data.changes} /> : null}
      {data ? (
        <Card>
          <CardContent className="grid gap-2 p-5 md:p-6">
            <h2 className="text-base font-bold">Net worth, 24 months</h2>
            {latest ? <Amount currency={bookCurrency} minor={latest.net} /> : null}
            {firstWorth ? (
              <p className={`text-sm font-semibold ${worthDelta > 0 ? "text-pos" : worthDelta < 0 ? "text-attn" : ""}`}>
                {worthDelta > 0 ? "Up" : worthDelta < 0 ? "Down" : "No change"}{" "}
                {formatMoney(bookCurrency, worthDelta < 0 ? -worthDelta : worthDelta)} since {monthTitle(firstWorth.month)}.
              </p>
            ) : null}
            <ForecastChart
              currency={bookCurrency}
              label={`Net worth for 24 months. Latest ${formatMoney(bookCurrency, latest?.net ?? 0)}.`}
              dates={data.netWorth.map((point) => point.month)}
              series={[{ name: "Net worth", amounts: data.netWorth.map((point) => point.net) }]}
            />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
