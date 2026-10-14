import { categories, categoryGroups } from "@num/db";
import { defaultInsightWindow, Temporal, type Insights, type InsightsQuery } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { changeMonth, readInsightChanges } from "./insights-changes";
import { loadLedgerLines } from "./ledger-lines";
import { breakdownRange, firstTransactionDate, windowPeriod } from "./insights-period";
import { categoryRow, donutRows, spendRows, spendTotals } from "./insights-spend";
import { readTimeline } from "./insights-timeline";
import { netWorthSeries, type MonthPoint } from "./insights-worth";

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

function assertFilters(db: Db, query: InsightsQuery) {
  if (query.group && query.group !== "none") {
    if (!db.select({ id: categoryGroups.id }).from(categoryGroups).where(eq(categoryGroups.id, query.group)).get()) {
      throw new ServiceError("group_not_found", 404);
    }
  }
  if (query.category) {
    if (!db.select({ id: categories.id }).from(categories).where(eq(categories.id, query.category)).get()) {
      throw new ServiceError("category_not_found", 404);
    }
  }
}

export function readInsights(db: Db, query: InsightsQuery): Insights {
  assertFilters(db, query);
  const window = query.window ?? defaultInsightWindow;
  const period = windowPeriod(query.asOf, window, query, firstTransactionDate(db));
  const range = breakdownRange(period, query.month);
  const facts = loadLedgerLines(db);
  const category = query.category ?? null;
  const donut = donutRows(facts, range, { group: query.group ?? null });
  const totals = spendTotals(facts, range);
  return {
    asOf: query.asOf,
    window,
    from: period.from,
    to: period.to,
    range,
    income: totals.income,
    spending: totals.spending,
    savings: totals.savings,
    savingsRateMilliPct: totals.savingsRateMilliPct,
    changes: readInsightChanges(db, facts, changeMonth(period, query.month), query.asOf),
    donut,
    rows: category === null ? donut : [categoryRow(facts, range, category)],
    merchants: spendRows(facts, range, (fact) => (fact.merchantId ? [fact.merchantId] : []), true),
    tags: spendRows(facts, range, (fact) => fact.tagIds, false),
    timeline: readTimeline(db, facts, period, query.asOf, category),
    netWorth: netWorthSeries(db, monthEnds(query.asOf, 24)),
  };
}
