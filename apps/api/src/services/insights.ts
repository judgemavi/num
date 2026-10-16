import { categories, categoryGroups, tags } from "@num/db";
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
  if (query.tagId) {
    if (!db.select({ id: tags.id }).from(tags).where(eq(tags.id, query.tagId)).get()) {
      throw new ServiceError("tag_not_found", 404);
    }
  }
}

/**
 * The spending report of a period. With a tag, each part uses only the lines that have the tag. A line with more than
 * one tag counts in full for each tag. The report of a tag has no income, no savings and no forecast.
 */
export function readInsights(db: Db, query: InsightsQuery): Insights {
  assertFilters(db, query);
  const window = query.window ?? defaultInsightWindow;
  const period = windowPeriod(query.asOf, window, query, firstTransactionDate(db));
  const range = breakdownRange(period, query.month);
  const tagId = query.tagId ?? null;
  const facts = loadLedgerLines(db, { from: period.from, through: period.to, tagId: query.tagId });
  const totals = spendTotals(facts, range);
  return {
    asOf: query.asOf,
    window,
    from: period.from,
    to: period.to,
    range,
    tagId,
    income: tagId ? null : totals.income,
    spending: totals.spending,
    savings: tagId ? null : totals.savings,
    savingsRateMilliPct: tagId ? null : totals.savingsRateMilliPct,
    groups: groupRows(facts, range, new Map(db.select({ id: categoryGroups.id, color: categoryGroups.color }).from(categoryGroups).all().map((row) => [row.id, row.color]))),
    timeline: readTimeline(db, facts, period, query.asOf, { categoryId: query.category ?? null, tagged: tagId !== null }),
  };
}
