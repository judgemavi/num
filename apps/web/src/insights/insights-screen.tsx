import {
  insightsSchema,
  Temporal,
  type ErrorCode,
  type InsightBreakdown,
  type InsightRow,
  type InsightsSearch,
} from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { localAsOf } from "@/as-of";
import { Amount } from "@/components/amount";
import { PaydayIllustration } from "@/components/illustrations";
import { ListCard, ListRow, listAmt, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { SidePanel } from "@/components/side-panel";
import { Fact, SummaryStrip } from "@/components/summary-strip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBookCurrency, useCategories, useGroups, useMerchants, useTags } from "@/editors/lookups";
import { monthTitle } from "@/insights/format";
import { InsightsChart } from "@/insights/insights-chart";
import { formatMoney } from "@/money";
import { apiRequest } from "@/request";
import { OptionCombobox } from "@/transactions/option-combobox";

const insightsRoute = getRouteApi("/insights");

const breakdowns: { id: InsightBreakdown; label: string }[] = [
  { id: "category", label: "Category" },
  { id: "group", label: "Group" },
  { id: "merchant", label: "Merchant" },
  { id: "tag", label: "Tag" },
];

const errorText: Partial<Record<ErrorCode, string>> = {
  period_invalid: "The start date is after the end date.",
  category_not_found: "That category is not in the book.",
  as_of_invalid: "The date is not valid.",
};

function rangeText(from: string, to: string): string {
  const start = Temporal.PlainDate.from(from).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const end = Temporal.PlainDate.from(to).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${start} to ${end}`;
}

function rowLabel(row: InsightRow, by: InsightBreakdown, names: Map<string, string>): string {
  if (row.kind === "uncategorized") {
    return "Uncategorized";
  }
  if (row.kind === "none") {
    if (by === "group") {
      return "No group";
    }
    if (by === "merchant") {
      return "No merchant";
    }
    return "No tag";
  }
  return names.get(row.id ?? "") ?? "Unknown";
}

function insightsPath(asOf: string, search: InsightsSearch): string {
  const params = new URLSearchParams({ asOf });
  if (search.from) {
    params.set("from", search.from);
  }
  if (search.to) {
    params.set("to", search.to);
  }
  if (search.by) {
    params.set("by", search.by);
  }
  if (search.categoryId) {
    params.set("categoryId", search.categoryId);
  }
  return `/api/insights?${params}`;
}

export function InsightsScreen() {
  const asOf = localAsOf();
  const search = insightsRoute.useSearch();
  const navigateSearch = insightsRoute.useNavigate();
  const navigate = useNavigate();
  const currency = useBookCurrency();
  const categories = useCategories();
  const groups = useGroups();
  const merchants = useMerchants();
  const tags = useTags();
  const report = useQuery({
    queryKey: ["insights", asOf, search.from, search.to, search.by, search.categoryId],
    queryFn: async () => {
      const result = await apiRequest(insightsPath(asOf, search), insightsSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });

  const bookCurrency = currency.data ?? "USD";
  const by = report.data?.by ?? search.by ?? "category";
  const nameSource =
    by === "group" ? groups.data : by === "merchant" ? merchants.data : by === "tag" ? tags.data : categories.data;
  const names = new Map((nameSource ?? []).map((item) => [item.id, item.name]));
  const expenseCategories = (categories.data ?? []).filter((item) => item.kind === "expense" || item.id === search.categoryId);
  const trendName = categories.data?.find((item) => item.id === search.categoryId)?.name;
  const data = report.data;
  const latest = data?.netWorth.at(-1);
  const firstWorth = data?.netWorth[0];
  const worthDelta = latest && firstWorth ? latest.net - firstWorth.net : 0;

  function patchSearch(patch: Partial<InsightsSearch>) {
    void navigateSearch({
      search: (prev) => {
        const next = { ...prev, ...patch };
        if (next.from === undefined) {
          delete next.from;
        }
        if (next.to === undefined) {
          delete next.to;
        }
        if (next.by === undefined) {
          delete next.by;
        }
        if (next.categoryId === undefined) {
          delete next.categoryId;
        }
        return next;
      },
    });
  }

  function openTransactions(row: InsightRow) {
    if (!data) {
      return;
    }
    void navigate({
      to: "/transactions",
      search: {
        page: 1,
        pageSize: 50,
        uncategorized: row.kind === "uncategorized",
        automatic: false,
        from: data.from,
        to: data.to,
        categoryId: by === "category" && row.kind === "item" ? (row.id ?? undefined) : undefined,
        merchantId: by === "merchant" && row.kind === "item" ? (row.id ?? undefined) : undefined,
        tagId: by === "tag" && row.kind === "item" ? (row.id ?? undefined) : undefined,
      },
    });
  }

  const trendSeries = data?.categoryTrend
    ? [{ name: trendName ?? "Category", amounts: data.categoryTrend.map((point) => point.spending) }]
    : [
        { name: "Spending", amounts: (data?.trend ?? []).map((point) => point.spending) },
        { name: "Income", amounts: (data?.trend ?? []).map((point) => point.income), dashed: true },
      ];
  const latestTrend = data?.categoryTrend?.at(-1) ?? data?.trend.at(-1);
  const trendLabel = data?.categoryTrend
    ? `${trendName ?? "Category"} spending for 12 months. Latest ${formatMoney(bookCurrency, latestTrend && "spending" in latestTrend ? latestTrend.spending : 0)}.`
    : `Spending and income for 12 months. Latest spending ${formatMoney(bookCurrency, data?.trend.at(-1)?.spending ?? 0)}. Latest income ${formatMoney(bookCurrency, data?.trend.at(-1)?.income ?? 0)}.`;

  return (
    <>
      <PageHeader
        kicker="Insights"
        title="Spending"
        actions={
          <Button type="button" variant="secondary" asChild>
            <Link to="/insights/months">Months</Link>
          </Button>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-44">
          <FieldLabel htmlFor="insights-from">From</FieldLabel>
          <Input
            id="insights-from"
            type="date"
            value={search.from ?? ""}
            onChange={(event) => patchSearch({ from: event.target.value || undefined })}
          />
        </Field>
        <Field className="w-44">
          <FieldLabel htmlFor="insights-to">To</FieldLabel>
          <Input id="insights-to" type="date" value={search.to ?? ""} onChange={(event) => patchSearch({ to: event.target.value || undefined })} />
        </Field>
        <Field className="w-44">
          <FieldLabel htmlFor="insights-by">Show</FieldLabel>
          <Select
            value={search.by ?? "category"}
            onValueChange={(value) => patchSearch({ by: value === "category" ? undefined : (value as InsightBreakdown) })}
          >
            <SelectTrigger id="insights-by" aria-label="Show">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {breakdowns.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field className="w-64">
          <FieldLabel htmlFor="insights-trend">12-month trend</FieldLabel>
          <OptionCombobox
            id="insights-trend"
            value={search.categoryId ?? null}
            placeholder="Total spending and income"
            emptyLabel="Total spending and income"
            options={expenseCategories.map((item) => ({ id: item.id, label: item.name }))}
            onChange={(id) => patchSearch({ categoryId: id ?? undefined })}
          />
        </Field>
      </div>
      {report.isPending ? <p className="text-muted-foreground">Loading insights.</p> : null}
      {report.isError ? (
        <div className="grid gap-3">
          <p role="alert">{errorText[(report.error instanceof Error ? report.error.message : "") as ErrorCode] ?? "Insights did not load."}</p>
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
          hint={rangeText(data.from, data.to)}
          facts={
            <>
              <Fact label="Income">
                <Amount currency={bookCurrency} minor={data.income} />
              </Fact>
              <Fact label="Saved">
                <Amount currency={bookCurrency} minor={data.savings} />
              </Fact>
            </>
          }
          illustration={<PaydayIllustration />}
        />
      ) : null}
      {data ? (
        <Card>
          <CardContent className="grid gap-2 p-5 md:p-6">
            <h2 className="text-base font-bold">{data.categoryTrend ? `${trendName ?? "Category"}, 12 months` : "Spending and income, 12 months"}</h2>
            <InsightsChart currency={bookCurrency} label={trendLabel} months={data.trend.map((point) => point.month)} series={trendSeries} />
          </CardContent>
        </Card>
      ) : null}
      {data ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
          <ListCard label="Spending" title={breakdowns.find((item) => item.id === by)?.label ?? "Category"}>
            {data.rows.length === 0 ? <p className="px-5 py-4 text-sm text-muted-foreground">No spending in this period.</p> : null}
            {data.rows.map((row) => (
              <ListRow key={`${row.kind}-${row.id ?? "none"}`} onOpen={() => openTransactions(row)}>
                <span className={listName}>{rowLabel(row, by, names)}</span>
                <span className={listAmt}>
                  <Amount currency={bookCurrency} minor={row.amount} />
                </span>
              </ListRow>
            ))}
          </ListCard>
          <SidePanel title="Net worth" text="Assets minus liabilities at each month end.">
            {latest ? <Amount currency={bookCurrency} minor={latest.net} /> : null}
            {firstWorth ? (
              <p className={`text-sm font-semibold ${worthDelta > 0 ? "text-pos" : worthDelta < 0 ? "text-attn" : ""}`}>
                {worthDelta > 0 ? "Up" : worthDelta < 0 ? "Down" : "No change"}{" "}
                {formatMoney(bookCurrency, worthDelta < 0 ? -worthDelta : worthDelta)} since {monthTitle(firstWorth.month)}.
              </p>
            ) : null}
            <InsightsChart
              currency={bookCurrency}
              label={`Net worth for 24 months. Latest ${formatMoney(bookCurrency, latest?.net ?? 0)} on ${latest?.date ?? asOf}.`}
              months={data.netWorth.map((point) => point.month)}
              series={[{ name: "Net worth", amounts: data.netWorth.map((point) => point.net) }]}
            />
          </SidePanel>
        </div>
      ) : null}
    </>
  );
}
