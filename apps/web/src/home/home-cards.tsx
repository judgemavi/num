import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BankStatusText } from "@/accounts/bank-status";
import { useBankMismatches } from "@/accounts/bank-status-reads";
import { overspentQuery } from "@/api/buckets";
import { fundingPaychecksQuery } from "@/api/funding";
import { insightsQuery } from "@/api/insights";
import { forecastQuery, monthPlanQuery } from "@/api/plan";
import { recurringSignalsQuery } from "@/api/recurring";
import { reviewSummaryQuery, useDecideItem } from "@/api/review";
import { localAsOf } from "@/as-of";
import { OverspentPanel } from "@/buckets/overspent-panel";
import { Amount } from "@/components/amount";
import { PaydayIllustration } from "@/components/illustrations";
import { ListCard, ListRow, listAmt, listName } from "@/components/list-card";
import { Fact, SummaryStrip } from "@/components/summary-strip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEditors } from "@/editors/editor-api";
import { useAccountLabels, useAccounts, useActivePlans, useBookCurrency, useCategoryNames } from "@/editors/lookups";
import { homeInsights } from "@/home/home-reads";
import { signedMoney } from "@/insights/format";
import { formatMoney } from "@/money";
import { ForecastChart } from "@/plan/forecast-chart";
import { MonthDetails, MonthFlow } from "@/plan/month-board";
import { paydayHint } from "@/review/format";
import { formatDate, levelLabel } from "@/transactions/format";

export function ForecastStrip() {
  const asOf = localAsOf();
  const currency = useBookCurrency();
  const { data: forecast } = useSuspenseQuery(forecastQuery(asOf));
  return (
    <SummaryStrip
      tint="home"
      label="Safe to spend until payday"
      amount={<Amount value={forecast.safeToSpend} hero />}
      hint={paydayHint(currency, asOf, forecast.nextIncomeDate, forecast.safeToSpend)}
      facts={
        <>
          <Fact label="Payday">{forecast.nextIncomeDate ? formatDate(forecast.nextIncomeDate) : "No paycheck"}</Fact>
          <Fact label="Buffer">
            <Amount value={forecast.bufferAmount} />
          </Fact>
        </>
      }
      illustration={<PaydayIllustration />}
    />
  );
}

const reviewLevels = ["questions", "sure", "likely", "maybe", "none"] as const;

export function ReviewCard() {
  const { data: review } = useSuspenseQuery(reviewSummaryQuery(localAsOf()));
  const counts = review.counts;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between px-5 pt-5">
        <CardTitle className="text-base font-bold">{review.total === 0 ? "Nothing needs review" : `${review.total} need review`}</CardTitle>
        <Button type="button" variant="secondary" asChild>
          <Link to="/transactions/review">Needs review</Link>
        </Button>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 px-5 pb-5">
        {reviewLevels.map((level) => (
          <Badge key={level} variant={counts[level] > 0 && level !== "none" ? "attention" : "neutral"}>
            {level === "questions" ? "Questions" : levelLabel(level)} {counts[level]}
          </Badge>
        ))}
      </CardContent>
    </Card>
  );
}

export function MonthPlanCards() {
  const currency = useBookCurrency();
  const { data: plan } = useSuspenseQuery(monthPlanQuery(localAsOf()));
  const feasibility = plan.feasibility;
  return (
    <>
      <MonthFlow plan={plan} />
      <MonthDetails plan={plan} />
      {feasibility && (feasibility.shortfall > 0 || feasibility.buckets.length > 0) ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <p className={feasibility.shortfall > 0 ? "font-semibold text-attn" : "font-semibold"}>
              {feasibility.shortfall > 0
                ? `Goals need ${formatMoney(currency, feasibility.shortfall)} more each paycheck than you have`
                : "Your goals fit your paychecks"}
            </p>
            <Button type="button" variant="secondary" asChild>
              <Link to="/buckets">
                Buckets
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

/** The paychecks that are not assigned to buckets. The card shows only when there is one. */
export function PaychecksCard() {
  const { openEditor } = useEditors();
  const { data: paychecks } = useSuspenseQuery(fundingPaychecksQuery());
  const decide = useDecideItem();
  const open = paychecks.filter((item) => !item.kept);
  if (open.length === 0) {
    return null;
  }
  return (
    <>
      <ListCard label="Fund this paycheck" title="Fund this paycheck">
        {open.map((item) => (
          <ListRow key={item.incomeTransactionId} onOpen={() => void openEditor("fundPaycheck", { incomeTransactionId: item.incomeTransactionId })}>
            <span className={listName}>
              {item.payee}
              <small>Fund buckets, or keep it unassigned</small>
            </span>
            <span className={listAmt}>
              <Amount value={item.amount} />
            </span>
            <Button
              type="button"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation();
                decide.mutate({ asOf: localAsOf(), itemKey: `paycheck_funding:${item.incomeTransactionId}`, decision: "keep_unassigned" });
              }}
            >
              Keep it unassigned
            </Button>
          </ListRow>
        ))}
      </ListCard>
    </>
  );
}

/** The recurring payments that did not arrive. The card shows only when there is one. */
export function MissedPaymentsCard() {
  const { openEditor } = useEditors();
  const plans = useActivePlans().items;
  const { data: signals } = useSuspenseQuery(recurringSignalsQuery(localAsOf()));
  if (signals.missed.length === 0) {
    return null;
  }
  return (
    <ListCard label="Missed payments" title="Missed payments">
      {signals.missed.map((item) => {
        const plan = plans.find((row) => row.id === item.planId);
        return (
        <ListRow key={`${item.planId}-${item.dueDate}`}>
          <span className={listName}>
            {plan?.name ?? "Recurring payment"}
            <small>Missed · due {formatDate(item.dueDate)}</small>
          </span>
          {plan ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void openEditor("linkOccurrence", { planId: plan.id, accountId: plan.accountId, dueDate: item.dueDate })}
            >
              Link a transaction
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={() => void openEditor("skipOccurrence", { planId: item.planId, dueDate: item.dueDate })}>
            Skip
          </Button>
        </ListRow>
        );
      })}
    </ListCard>
  );
}

/** The accounts that do not match their bank. The card shows only when there is one. */
export function BankMismatchCard() {
  const mismatches = useBankMismatches();
  const accounts = useAccounts();
  const labels = useAccountLabels();
  if (mismatches.length === 0) {
    return null;
  }
  return (
    <ListCard label="Bank balances" title="Accounts that do not match your bank">
      {mismatches.map((status) => {
        const kind = accounts.find((account) => account.id === status.accountId)?.kind;
        return (
          <ListRow key={status.accountId}>
            <span className={listName}>
              <Link to="/accounts/$accountId" params={{ accountId: status.accountId }} className="font-semibold text-primary">
                {labels.get(status.accountId)}
              </Link>
              {kind ? <BankStatusText kind={kind} status={status} /> : null}
            </span>
          </ListRow>
        );
      })}
    </ListCard>
  );
}

/** The overspent buckets. The card shows only when there is one. */
export function OverspentCard() {
  const { data: overspent } = useSuspenseQuery(overspentQuery());
  return overspent.length > 0 ? <OverspentPanel /> : null;
}

function useHomeInsights() {
  return useSuspenseQuery(insightsQuery(localAsOf(), homeInsights)).data;
}

function ChangeRows({ rows, direction }: { rows: ReturnType<typeof useHomeInsights>["changes"]["increases"]; direction: "Up" | "Down" }) {
  const currency = useBookCurrency();
  const categoryNames = useCategoryNames();
  return rows.map((item) => (
    <ListRow key={item.categoryId} simple>
      <span className={listName}>
        {categoryNames.get(item.categoryId) ?? "Category"}
        <small>{direction}</small>
      </span>
      <span className={listAmt}>{signedMoney(currency, item.delta)}</span>
    </ListRow>
  ));
}

export function SpendingChangesCard() {
  const { changes } = useHomeInsights();
  return (
    <ListCard
      label="Spending changes this month"
      title="Spending changes this month"
      actions={
        <Button type="button" variant="secondary" asChild>
          <Link to="/insights">Insights</Link>
        </Button>
      }
    >
      <ChangeRows rows={changes.increases} direction="Up" />
      <ChangeRows rows={changes.decreases} direction="Down" />
      {changes.increases.length === 0 && changes.decreases.length === 0 ? (
        <p className="px-5 py-4 text-muted-foreground">No spending change this month.</p>
      ) : null}
    </ListCard>
  );
}

/** The net worth of the last 12 months. */
export function NetWorthCard() {
  const worth = useHomeInsights().netWorth.slice(-12);
  const latestWorth = worth.at(-1);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between px-5 pt-5">
        <CardTitle className="text-base font-bold">Net worth</CardTitle>
        <Button type="button" variant="secondary" asChild>
          <Link to="/insights">Insights</Link>
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 px-5 pb-5">
        {latestWorth ? <Amount value={latestWorth.net} /> : <p className="text-muted-foreground">No net worth yet.</p>}
        {worth.length > 1 ? (
          <ForecastChart label="Net worth, 12 months" dates={worth.map((point) => point.month)} series={[{ name: "Net worth", amounts: worth.map((point) => point.net) }]} />
        ) : null}
      </CardContent>
    </Card>
  );
}
