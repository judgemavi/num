import {
  bucketEventSchema,
  forecastSchema,
  fundingPaycheckListSchema,
  hygieneSchema,
  insightsSchema,
  monthDetailSchema,
  monthPlanSchema,
  overspentListSchema,
  recurringSignalsSchema,
  transactionListSchema,
} from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { localAsOf } from "@/as-of";
import { OverspentPanel } from "@/buckets/overspent-panel";
import { Amount } from "@/components/amount";
import { PaydayIllustration } from "@/components/illustrations";
import { ListCard, ListRow, listAmt, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { Fact, SummaryStrip } from "@/components/summary-strip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ForecastChart } from "@/plan/forecast-chart";
import { MonthDetails, MonthFlow } from "@/plan/month-board";
import { useEditors } from "@/editors/editor-api";
import { useActiveBuckets, useBookCurrency, useCategories } from "@/editors/lookups";
import { paydayHint } from "@/inbox/format";
import { HygienePanel } from "@/insights/hygiene-panel";
import { levelLabel } from "@/transactions/format";
import { apiRequest } from "@/request";
import { useState } from "react";
import { decideItem } from "@/inbox/actions";

export function HomeScreen() {
  const asOf = localAsOf();
  const month = asOf.slice(0, 7);
  const currency = useBookCurrency();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const categories = useCategories();
  const buckets = useActiveBuckets();
  const { openEditor } = useEditors();
  const [coverFrom, setCoverFrom] = useState<Record<string, string>>({});
  const bookCurrency = currency.data ?? "USD";
  const categoryName = new Map((categories.data ?? []).map((item) => [item.id, item.name]));

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
  const plan = useQuery({
    queryKey: ["month-plan", asOf, month],
    queryFn: async () => {
      const result = await apiRequest(`/api/plan?asOf=${asOf}&month=${month}`, monthPlanSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });
  const story = useQuery({
    queryKey: ["month", month, asOf],
    queryFn: async () => {
      const result = await apiRequest(`/api/months/${month}?asOf=${asOf}`, monthDetailSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.story;
    },
  });
  const hygiene = useQuery({
    queryKey: ["hygiene", asOf],
    queryFn: async () => {
      const result = await apiRequest(`/api/hygiene?asOf=${asOf}`, hygieneSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });
  const review = useQuery({
    queryKey: ["needs-review-count", asOf],
    queryFn: async () => {
      const result = await apiRequest(`/api/transactions?needsReview=true&asOf=${asOf}&pageSize=1`, transactionListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });
  const paychecks = useQuery({
    queryKey: ["funding-paychecks"],
    queryFn: async () => {
      const result = await apiRequest("/api/funding/paychecks", fundingPaycheckListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.items;
    },
  });
  const signals = useQuery({
    queryKey: ["recurring-signals", asOf],
    queryFn: async () => {
      const result = await apiRequest(`/api/recurring/signals?asOf=${asOf}`, recurringSignalsSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });
  const overspent = useQuery({
    queryKey: ["buckets", "overspent"],
    queryFn: async () => {
      const result = await apiRequest("/api/buckets/overspent", overspentListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.items;
    },
  });
  const insights = useQuery({
    queryKey: ["insights", asOf, "home"],
    queryFn: async () => {
      const result = await apiRequest(`/api/insights?asOf=${asOf}`, insightsSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });

  const counts = review.data?.reviewCounts;
  const reviewTotal = review.data?.total ?? 0;
  const clear = reviewTotal === 0 && (hygiene.data?.checks.every((item) => item.pass) ?? false) && (paychecks.data?.length ?? 0) === 0 && (signals.data?.missed.length ?? 0) === 0 && (overspent.data?.length ?? 0) === 0;
  const worth = insights.data?.netWorth.slice(-12) ?? [];
  const latestWorth = worth.at(-1);

  return (
    <>
      <PageHeader kicker={clear ? "All clear" : "This week"} title="Home" />
      <SummaryStrip
        tint="home"
        label="Safe to spend until payday"
        amount={<Amount currency={bookCurrency} minor={forecast.data?.safeToSpend ?? 0} hero />}
        hint={forecast.data ? paydayHint(bookCurrency, asOf, forecast.data.nextIncomeDate, forecast.data.safeToSpend) : "Loading the forecast."}
        facts={
          <>
            <Fact label="Payday">{forecast.data?.nextIncomeDate ?? "No paycheck"}</Fact>
            <Fact label="Buffer">
              <Amount currency={bookCurrency} minor={forecast.data?.bufferAmount ?? 0} />
            </Fact>
          </>
        }
        illustration={<PaydayIllustration />}
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between px-5 pt-5">
          <CardTitle className="text-base font-bold">{reviewTotal === 0 ? "Nothing needs review" : `${reviewTotal} need review`}</CardTitle>
          <Button type="button" variant="secondary" asChild>
            <Link to="/transactions" search={{ page: 1, pageSize: 50, needsReview: true, asOf, uncategorized: false, automatic: false }}>
              Transactions
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 px-5 pb-5">
          {counts
            ? (["sure", "likely", "maybe", "none"] as const).map((level) => (
                <Badge key={level} variant={counts[level] > 0 && level !== "none" ? "attention" : "neutral"}>
                  {levelLabel(level)} {counts[level]}
                </Badge>
              ))
            : null}
        </CardContent>
      </Card>
      <HygienePanel
        currency={bookCurrency}
        hygiene={hygiene.data}
        pending={hygiene.isPending}
        failed={hygiene.isError}
        onMonth={(next) => {
          void navigate({ to: "/insights/months", search: { month: next } });
        }}
      />
      {plan.data ? (
        <>
          <MonthFlow plan={plan.data} currency={bookCurrency} />
          <MonthDetails plan={plan.data} currency={bookCurrency} />
        </>
      ) : null}
      {paychecks.data && paychecks.data.length > 0 ? (
        <ListCard label="Fund this paycheck" title="Fund this paycheck">
          {paychecks.data.map((item) => (
            <ListRow key={item.incomeTransactionId} onOpen={() => void openEditor("fundPaycheck", { incomeTransactionId: item.incomeTransactionId })}>
              <span className={listName}>
                {item.payee}
                <small>Fund buckets, or keep it unassigned</small>
              </span>
              <span className={listAmt}>
                <Amount currency={bookCurrency} minor={item.amount} />
              </span>
              <Button
                type="button"
                variant="ghost"
                onClick={(event) => {
                  event.stopPropagation();
                  void decideItem(asOf, `paycheck_funding:${item.incomeTransactionId}`, "keep_unassigned").then(() => {
                    void paychecks.refetch();
                  });
                }}
              >
                Keep it unassigned
              </Button>
            </ListRow>
          ))}
        </ListCard>
      ) : null}
      {signals.data && signals.data.missed.length > 0 ? (
        <ListCard label="Missed payments" title="Missed payments">
          {signals.data.missed.map((item) => (
            <ListRow key={`${item.planId}-${item.dueDate}`}>
              <span className={listName}>
                Missed payment
                <small>{item.dueDate}</small>
              </span>
              <Button type="button" variant="ghost" onClick={() => void openEditor("plan", { id: item.planId })}>
                Link a transaction
              </Button>
              <Button type="button" variant="ghost" onClick={() => void openEditor("skipOccurrence", { planId: item.planId, dueDate: item.dueDate })}>
                Skip
              </Button>
            </ListRow>
          ))}
        </ListCard>
      ) : null}
      {overspent.data && overspent.data.length > 0 && buckets.data ? (
        <OverspentPanel
          currency={bookCurrency}
          items={overspent.data}
          pool={buckets.data?.items ?? []}
          coverFrom={coverFrom}
          onCoverFrom={(id, bucketId) => setCoverFrom((current) => ({ ...current, [id]: bucketId }))}
          onCover={(id) => {
            const fromBucketId = coverFrom[id];
            if (!fromBucketId) {
              return;
            }
            void apiRequest(`/api/buckets/${id}/cover`, bucketEventSchema, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ fromBucketId, date: asOf }),
            }).then(() => queryClient.invalidateQueries({ queryKey: ["buckets", "overspent"] }));
          }}
        />
      ) : null}
      <ListCard
        label="Spending changes this month"
        title="Spending changes this month"
        actions={
          <Button type="button" variant="secondary" asChild>
            <Link to="/insights">Insights</Link>
          </Button>
        }
      >
        {story.data?.increases.map((item) => (
          <ListRow key={`up-${item.categoryId}`} simple>
            <span className={listName}>
              {categoryName.get(item.categoryId) ?? "Category"}
              <small>Up</small>
            </span>
            <span className={listAmt}>
              <Amount currency={bookCurrency} minor={item.delta} />
            </span>
          </ListRow>
        ))}
        {story.data?.decreases.map((item) => (
          <ListRow key={`down-${item.categoryId}`} simple>
            <span className={listName}>
              {categoryName.get(item.categoryId) ?? "Category"}
              <small>Down</small>
            </span>
            <span className={listAmt}>
              <Amount currency={bookCurrency} minor={item.delta} />
            </span>
          </ListRow>
        ))}
        {story.data && story.data.increases.length === 0 && story.data.decreases.length === 0 ? (
          <p className="px-5 py-4 text-muted-foreground">No spending change this month.</p>
        ) : null}
      </ListCard>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between px-5 pt-5">
          <CardTitle className="text-base font-bold">Net worth</CardTitle>
          <Button type="button" variant="secondary" asChild>
            <Link to="/insights">Insights</Link>
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 pb-5">
          {latestWorth ? <Amount currency={bookCurrency} minor={latestWorth.net} /> : <p className="text-muted-foreground">No net worth yet.</p>}
          {worth.length > 1 ? (
            <ForecastChart
              currency={bookCurrency}
              label="Net worth, 12 months"
              dates={worth.map((point) => point.month)}
              series={[{ name: "Net worth", amounts: worth.map((point) => point.net) }]}
            />
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
