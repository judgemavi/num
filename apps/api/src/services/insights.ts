import { categories } from "@num/db";
import { defaultInsightWindow, type Insights, type InsightsQuery } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { loadLedgerLines } from "./ledger-lines";
import { breakdownRange, firstTransactionDate, windowPeriod } from "./insights-period";
import { groupRows, spendTotals } from "./insights-spend";
import { readTimeline } from "./insights-timeline";

function assertFilters(db: Db, query: InsightsQuery) {
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
    groups: groupRows(facts, range),
    timeline: readTimeline(db, facts, period, query.asOf, category),
  };
}
