import { categories } from "@num/db";
import { Temporal, type Insights, type InsightsQuery } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { loadSpendFacts, spendingReport, trendReport, type MonthPoint } from "./insights-spend";
import { netWorthSeries } from "./insights-worth";

function monthEnds(asOf: string, count: number): MonthPoint[] {
  const end = Temporal.PlainDate.from(asOf).with({ day: 1 });
  const start = end.subtract({ months: count - 1 });
  const points: MonthPoint[] = [];
  for (let index = 0; index < count; index += 1) {
    const monthDate = start.add({ months: index });
    const last = monthDate.with({ day: monthDate.daysInMonth }).toString();
    points.push({
      month: monthDate.toString().slice(0, 7),
      date: last > asOf ? asOf : last,
    });
  }
  return points;
}

function resolvePeriod(asOf: string, from: string | undefined, to: string | undefined): { from: string; to: string } {
  const start = from ?? `${asOf.slice(0, 7)}-01`;
  const end = to ?? asOf;
  if (start > end) {
    throw new ServiceError("period_invalid", 400);
  }
  return { from: start, to: end };
}

export function readInsights(db: Db, query: InsightsQuery): Insights {
  const by = query.by ?? "category";
  const period = resolvePeriod(query.asOf, query.from, query.to);
  if (query.categoryId) {
    const category = db.select({ id: categories.id }).from(categories).where(eq(categories.id, query.categoryId)).get();
    if (!category) {
      throw new ServiceError("category_not_found", 404);
    }
  }
  const facts = loadSpendFacts(db);
  const totals = spendingReport(facts, period, by);
  const history = monthEnds(query.asOf, 24);
  const months = history.slice(-12);
  const trend = trendReport(facts, months, query.categoryId ?? null);
  return {
    asOf: query.asOf,
    from: period.from,
    to: period.to,
    by,
    income: totals.income,
    spending: totals.spending,
    savings: totals.savings,
    rows: totals.rows,
    trend: trend.trend,
    categoryTrend: trend.categoryTrend,
    netWorth: netWorthSeries(db, history),
  };
}
