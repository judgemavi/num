import { accountListSchema, currencyUpdateSchema, forecastSchema, Temporal } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { localAsOf } from "@/as-of";
import { Amount } from "@/components/amount";
import { PaycheckSplitIllustration } from "@/components/illustrations";
import { PageHeader } from "@/components/page-header";
import { Fact, SummaryStrip } from "@/components/summary-strip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ForecastChart } from "@/plan/forecast-chart";
import { apiRequest } from "@/request";
import { loadAllPages } from "@/settings/load-all-pages";

function shortDate(iso: string): string {
  return Temporal.PlainDate.from(iso).toLocaleString(undefined, { month: "short", day: "numeric" });
}

function longRange(from: string, to: string): string {
  const start = Temporal.PlainDate.from(from).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const end = Temporal.PlainDate.from(to).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${start} to ${end}`;
}

export function PlanScreen() {
  const asOf = localAsOf();
  const [accountId, setAccountId] = useState("total");
  const currency = useQuery({
    queryKey: ["book-currency"],
    queryFn: async () => {
      const result = await apiRequest("/api/settings/currency", currencyUpdateSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.currency;
    },
  });
  const accounts = useQuery({
    queryKey: ["accounts", "plan"],
    queryFn: () => loadAllPages("/api/accounts", accountListSchema, { archived: false, sort: "name", dir: "asc" }),
  });
  const forecast = useQuery({
    queryKey: ["forecast", asOf],
    queryFn: async () => {
      const result = await apiRequest(`/api/forecast?asOf=${asOf}`, forecastSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });

  const bookCurrency = currency.data ?? "USD";
  const names = new Map((accounts.data?.items ?? []).map((account) => [account.id, account.name]));
  const selected = forecast.data?.accounts.find((account) => account.accountId === accountId);
  const series = selected ?? forecast.data?.total;
  const lowest = selected?.lowest ?? forecast.data?.lowest;
  const title = selected ? (names.get(selected.accountId) ?? "Account") : "On-budget total";
  const first = forecast.data?.dates[0];
  const last = forecast.data?.dates[forecast.data.dates.length - 1];

  return (
    <>
      <PageHeader kicker="Next 90 days" title="Plan" />
      {forecast.data && lowest ? (
        <SummaryStrip
          tint="plan"
          label="Lowest point"
          amount={
            <span className="text-attn">
              <Amount currency={bookCurrency} minor={forecast.data.lowest.amount} hero />
            </span>
          }
          hint={shortDate(forecast.data.lowest.date)}
          facts={
            <>
              <Fact label="Safe to spend">
                <Amount currency={bookCurrency} minor={forecast.data.safeToSpend} />
              </Fact>
              <Fact label="Known in 90 days">
                <Amount currency={bookCurrency} minor={forecast.data.total.known[forecast.data.dates.length - 1] ?? 0} />
              </Fact>
              <Fact label="Estimated in 90 days">
                <Amount currency={bookCurrency} minor={forecast.data.total.estimated[forecast.data.dates.length - 1] ?? 0} />
              </Fact>
            </>
          }
          illustration={<PaycheckSplitIllustration />}
        />
      ) : null}
      <Card>
        <CardContent className="grid gap-4 p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-base font-bold">{title}, next 90 days</h2>
              {first && last ? <p className="text-sm text-muted-foreground">{longRange(first, last)}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-4 text-sm">
                <span className="inline-flex items-center gap-2">
                  <svg width="28" height="10" aria-hidden="true">
                    <line x1="0" y1="5" x2="28" y2="5" className="stroke-primary" strokeWidth="2.5" />
                  </svg>
                  Known
                </span>
                <span className="inline-flex items-center gap-2">
                  <svg width="28" height="10" aria-hidden="true">
                    <line x1="0" y1="5" x2="28" y2="5" className="stroke-est" strokeWidth="2.5" strokeDasharray="6 4" />
                  </svg>
                  Estimated
                </span>
              </div>
              <Select value={selected ? accountId : "total"} onValueChange={setAccountId}>
                <SelectTrigger className="w-56" aria-label="Account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">On-budget total</SelectItem>
                  {(forecast.data?.accounts ?? []).map((account) => (
                    <SelectItem key={account.accountId} value={account.accountId}>
                      {names.get(account.accountId) ?? "Account"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {forecast.isPending ? <p className="text-muted-foreground">Loading the forecast.</p> : null}
          {forecast.isError ? (
            <div className="grid gap-3">
              <p>The forecast did not load.</p>
              <Button type="button" onClick={() => void forecast.refetch()}>
                Try again
              </Button>
            </div>
          ) : null}
          {forecast.data && series && lowest ? (
            <ForecastChart
              currency={bookCurrency}
              dates={forecast.data.dates}
              known={series.known}
              estimated={series.estimated}
              lowest={lowest}
            />
          ) : null}
          <p className="text-sm text-muted-foreground">
            Known counts paychecks, bills, transfers and card payments. Estimated also counts usual spending.
          </p>
          {forecast.data?.warnings.map((warning) => {
            const name = names.get(warning.accountId) ?? "Account";
            const text =
              warning.code === "manual_card"
                ? `${name} has no planned payment.`
                : `${name} has no usual payment account.`;
            return (
              <p key={`${warning.code}-${warning.accountId}`} className="text-sm font-semibold text-attn">
                {text}
              </p>
            );
          })}
          {forecast.data?.accounts
            .filter((account) => account.risk !== null)
            .map((account) => (
              <p key={account.accountId} className="text-sm font-semibold text-attn">
                {account.risk === "below_zero"
                  ? `${names.get(account.accountId) ?? "Account"} goes below zero on ${shortDate(account.lowest.date)}.`
                  : `${names.get(account.accountId) ?? "Account"} goes below your buffer on ${shortDate(account.lowest.date)}.`}
              </p>
            ))}
        </CardContent>
      </Card>
    </>
  );
}
