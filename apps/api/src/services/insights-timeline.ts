import {
  expenseSpending,
  isExpenseLine,
  isIncomeLine,
  type ForecastMonth,
  type InsightFlow,
  type InsightTimeline,
  type InsightTimelineMonth,
} from "@num/shared";
import type { Db } from "../db";
import { readForecast } from "./forecast";
import { periodMonths, type Period } from "./insights-period";
import type { LedgerLine } from "./ledger-lines";

/** What the timeline shows. A category limits it to that category. With a category or a tag, it shows only spending. */
export type TimelineScope = { categoryId: string | null; tagged: boolean };

/** Actual income and spending of each month in the period. With a category or a tag, only the spending. */
export function actualMonths(facts: readonly LedgerLine[], period: Period, scope: TimelineScope): Map<string, InsightFlow> {
  const months = new Map<string, InsightFlow>(periodMonths(period.from, period.to).map((month) => [month, { income: 0, spending: 0 }]));
  const spendingOnly = scope.categoryId !== null || scope.tagged;
  for (const fact of facts) {
    const flow = months.get(fact.month);
    if (!flow || fact.date < period.from || fact.date > period.to) {
      continue;
    }
    if (isExpenseLine(fact) && (scope.categoryId === null || fact.categoryId === scope.categoryId)) {
      flow.spending += expenseSpending(fact.amount);
    }
    if (!spendingOnly && isIncomeLine(fact)) {
      flow.income += fact.amount;
    }
  }
  return months;
}

/**
 * One row for each month from the start of the period to the last forecast month.
 * The month of asOf has an actual part (to asOf) and a forecast part (the forecast days in that month).
 */
export function timelineMonths(period: Period, actual: Map<string, InsightFlow>, forecast: readonly ForecastMonth[]): InsightTimelineMonth[] {
  const last = forecast.at(-1)?.month ?? period.to.slice(0, 7);
  const end = last > period.to.slice(0, 7) ? `${last}-01` : period.to;
  const planned = new Map(forecast.map((item) => [item.month, { income: item.income, spending: item.spending }]));
  return periodMonths(period.from, end).map((month) => ({
    month,
    actual: actual.get(month) ?? null,
    forecast: planned.get(month) ?? null,
  }));
}

/**
 * The timeline: actual months of the period, then the 90-day forecast (§8).
 * The forecast is only for a period that ends on asOf. A period that ends before asOf shows only its own months.
 * With a category or a tag, the timeline shows only the actual spending. A forecast has no category and no tag.
 */
export function readTimeline(db: Db, facts: readonly LedgerLine[], period: Period, asOf: string, scope: TimelineScope): InsightTimeline {
  const actual = actualMonths(facts, period, scope);
  const categoryId = scope.categoryId;
  if (categoryId !== null || scope.tagged || period.to !== asOf) {
    return { categoryId, months: timelineMonths(period, actual, []), forecastEnd: null };
  }
  const forecast = readForecast(db, asOf);
  return {
    categoryId: null,
    months: timelineMonths(period, actual, forecast.months),
    forecastEnd: forecast.dates.at(-1) ?? null,
  };
}
