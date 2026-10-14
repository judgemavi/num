import { accounts, transactions, valuations } from "@num/db";
import {
  expenseSpending,
  isExpenseLine,
  isIncomeLine,
  Temporal,
  type ForecastMonth,
  type InsightFlow,
  type InsightTimeline,
  type InsightTimelineMonth,
} from "@num/shared";
import { and, gte, lte, sql } from "drizzle-orm";
import type { Db } from "../db";
import { balancesOf } from "./account-balance";
import { usesValuation } from "./account-rules";
import { readForecast } from "./forecast";
import { periodMonths, type Period } from "./insights-period";
import type { LedgerLine } from "./ledger-lines";

/** Actual income and spending of each month in the period. With a category, only that category's spending. */
export function actualMonths(facts: readonly LedgerLine[], period: Period, categoryId: string | null): Map<string, InsightFlow> {
  const months = new Map<string, InsightFlow>(periodMonths(period.from, period.to).map((month) => [month, { income: 0, spending: 0 }]));
  for (const fact of facts) {
    const flow = months.get(fact.month);
    if (!flow || fact.date < period.from || fact.date > period.to) {
      continue;
    }
    if (isExpenseLine(fact) && (categoryId === null || fact.categoryId === categoryId)) {
      flow.spending += expenseSpending(fact.amount);
    }
    if (categoryId === null && isIncomeLine(fact)) {
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

function onBudgetAccounts(db: Db) {
  return db
    .select()
    .from(accounts)
    .all()
    .filter((row) => row.onBudget)
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      openingBalance: row.openingBalance,
      archivedOn: row.archivedAt === null ? null : row.archivedAt.slice(0, 10),
    }));
}

/**
 * The total balance of the on-budget accounts at the end of each day of the period.
 * An archived account counts up to and including its archive date.
 */
export function dailyBalances(db: Db, period: Period): { date: string; amount: number }[] {
  const open = onBudgetAccounts(db);
  const ids = new Set(open.map((row) => row.id));
  const before = Temporal.PlainDate.from(period.from).subtract({ days: 1 }).toString();
  const balances = new Map(balancesOf(db, open, before).map((item) => [item.account.id, item.balance]));
  const valued = new Set(open.filter((row) => usesValuation(row.kind)).map((row) => row.id));
  const moves = new Map<string, { accountId: string; total: number }[]>();
  for (const row of db
    .select({ accountId: transactions.accountId, date: transactions.date, total: sql<number>`sum(${transactions.amount})` })
    .from(transactions)
    .where(and(gte(transactions.date, period.from), lte(transactions.date, period.to)))
    .groupBy(transactions.accountId, transactions.date)
    .all()) {
    if (ids.has(row.accountId)) {
      moves.set(row.date, [...(moves.get(row.date) ?? []), { accountId: row.accountId, total: row.total }]);
    }
  }
  const resets = new Map<string, { accountId: string; balance: number }[]>();
  for (const row of db
    .select()
    .from(valuations)
    .where(and(gte(valuations.date, period.from), lte(valuations.date, period.to)))
    .all()) {
    if (valued.has(row.accountId)) {
      resets.set(row.date, [...(resets.get(row.date) ?? []), { accountId: row.accountId, balance: row.balance }]);
    }
  }
  const points: { date: string; amount: number }[] = [];
  const end = Temporal.PlainDate.from(period.to);
  for (let day = Temporal.PlainDate.from(period.from); Temporal.PlainDate.compare(day, end) <= 0; day = day.add({ days: 1 })) {
    const date = day.toString();
    for (const move of moves.get(date) ?? []) {
      balances.set(move.accountId, (balances.get(move.accountId) ?? 0) + move.total);
    }
    for (const reset of resets.get(date) ?? []) {
      balances.set(reset.accountId, reset.balance);
    }
    let total = 0;
    for (const account of open) {
      if (account.archivedOn === null || date <= account.archivedOn) {
        total += balances.get(account.id) ?? 0;
      }
    }
    points.push({ date, amount: total });
  }
  return points;
}

/**
 * The timeline: actual months of the period, then the 90-day forecast (§8).
 * The forecast is only for a period that ends on asOf. A period that ends before asOf shows only its own months.
 * With a category, the timeline shows only the actual spending of that category.
 */
export function readTimeline(db: Db, facts: readonly LedgerLine[], period: Period, asOf: string, categoryId: string | null): InsightTimeline {
  const actual = actualMonths(facts, period, categoryId);
  if (categoryId !== null) {
    return { categoryId, months: timelineMonths(period, actual, []), balances: [], forecast: null };
  }
  const balances = dailyBalances(db, period);
  if (period.to !== asOf) {
    return { categoryId: null, months: timelineMonths(period, actual, []), balances, forecast: null };
  }
  const forecast = readForecast(db, asOf);
  return {
    categoryId: null,
    months: timelineMonths(period, actual, forecast.months),
    balances,
    forecast: {
      dates: forecast.dates,
      known: forecast.total.known,
      estimated: forecast.total.estimated,
      lowest: forecast.lowest,
    },
  };
}
