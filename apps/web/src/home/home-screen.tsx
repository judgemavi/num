import { notifyManager, useQueryClient, useSuspenseQueries } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { bankStatusesQuery } from "@/api/bank-balances";
import { hygieneQuery } from "@/api/insights";
import { scheduleSignalsQuery } from "@/api/schedules";
import { reviewSummaryQuery } from "@/api/review";
import { localAsOf } from "@/as-of";
import { Boundary } from "@/components/boundary";
import { PageHeader } from "@/components/page-header";
import { OverspentPanel } from "@/buckets/overspent-panel";
import { BankMismatchCard, ForecastStrip, MissedPaymentsCard, MonthPlanCards, NetWorthCard, ReviewCard, SpendingChangesCard, StillOwedCard } from "@/home/home-cards";
import { HygienePanel } from "@/insights/hygiene-panel";

/**
 * Home is a list of cards. Each card reads its own data, does its own writes, and shows its own loading text and error.
 * The loader of the route starts all reads together (`home-reads.ts`).
 */
export function HomeScreen() {
  return (
    <>
      <PageHeader
        title="Home"
        kicker={<HomeKickerPlace />}
      />
      <Boundary loading="Loading the forecast." failed="The forecast did not load.">
        <ForecastStrip />
      </Boundary>
      <Boundary loading="Loading Needs review." failed="Needs review did not load.">
        <ReviewCard />
      </Boundary>
      <Boundary loading="Loading the hygiene checks." failed="The hygiene checks did not load.">
        <HygienePanel />
      </Boundary>
      <Boundary loading={null} failed="The bank balances did not load.">
        <BankMismatchCard />
      </Boundary>
      <Boundary loading="Loading the plan of the month." failed="The plan of the month did not load.">
        <MonthPlanCards />
      </Boundary>
      <Boundary loading={null} failed="The amounts that buckets still owe did not load.">
        <StillOwedCard />
      </Boundary>
      <Boundary loading={null} failed="The missed payments did not load.">
        <MissedPaymentsCard />
      </Boundary>
      <Boundary loading={null} failed="The overspent buckets did not load.">
        <OverspentPanel />
      </Boundary>
      <Boundary loading="Loading the spending changes." failed="The spending changes did not load.">
        <SpendingChangesCard />
      </Boundary>
      <Boundary loading="Loading the net worth." failed="The net worth did not load.">
        <NetWorthCard />
      </Boundary>
    </>
  );
}

/** The reads of the kicker. The cards do the same reads. */
function kickerReads(asOf: string) {
  return [hygieneQuery(asOf), reviewSummaryQuery(asOf), scheduleSignalsQuery(asOf), bankStatusesQuery()] as const;
}

/**
 * The place of the kicker. The kicker shows nothing while a read loads and after a read fails.
 * The number of the reads that failed is the reset key of the boundary. Thus, when "Try again" on a card gets the
 * data, the kicker shows again.
 */
function HomeKickerPlace() {
  const queryClient = useQueryClient();
  const keys = kickerReads(localAsOf()).map((read) => read.queryKey);
  const failures = useSyncExternalStore(
    (onChange) => queryClient.getQueryCache().subscribe(notifyManager.batchCalls(onChange)),
    () => keys.filter((key) => queryClient.getQueryState(key)?.status === "error").length,
  );
  return (
    <Boundary loading={null} failed={() => null} resetKey={String(failures)}>
      <HomeKicker />
    </Boundary>
  );
}

/** "All clear" when no card needs the person. It reads the same data as the cards, from the cache. */
function HomeKicker() {
  const [{ data: hygiene }, { data: review }, { data: signals }, { data: bank }] = useSuspenseQueries({
    queries: kickerReads(localAsOf()),
  });
  const clear =
    review.total === 0 && hygiene.checks.every((item) => item.pass) && signals.missed.length === 0 && bank.items.every((item) => item.difference === 0);
  return clear ? "All clear" : "This week";
}
