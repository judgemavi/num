import { accounts, bucketCategories, buckets, categories, occurrenceLinks, transactionLines, transactions } from "@num/db";
import {
  buildForecast,
  forecastDates,
  isIsoDate,
  occurrenceDates,
  spendDeltas,
  unbucketedMonthly,
  type Forecast,
  type ForecastDelta,
  type ForecastFlow,
  type ForecastInput,
} from "@num/shared";
import { and, eq, gt, isNotNull, isNull, lte } from "drizzle-orm";
import type { Db } from "../db";
import { balancesOf } from "./account-balance";
import { lastCompleteMonths } from "./complete-months";
import { ServiceError } from "../service-error";
import { bookStep } from "./book-step";
import { activeSchedules, scheduleAmounts, type ScheduleView } from "./schedules";

function scheduleFlows(schedule: ScheduleView, date: string, amount: number): ForecastFlow[] {
  if (schedule.kind === "income") {
    return [{ date, income: amount, spending: 0, bucketId: schedule.id }];
  }
  return schedule.transferAccountId === null ? [{ date, income: 0, spending: -amount, bucketId: schedule.id }] : [];
}

export function readForecast(db: Db, asOf: string): Forecast {
  return buildForecast(forecastInput(db, asOf));
}

/**
 * The input of the forecast (spec §8). Each flow has its bucket: a commitment, an income or a spending bucket.
 * `transfersOut` are the commitment payments by transfer to an account that is not an open on-budget account (a loan
 * payment, for example). They leave the pool, but they are not spending in the forecast.
 */
export function forecastInput(db: Db, asOf: string): ForecastInput & { transfersOut: ForecastFlow[] } {
  const step = bookStep(db);
  if (!isIsoDate(asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf });
  }
  const dates = forecastDates(asOf);
  const horizonEnd = dates[dates.length - 1] ?? asOf;
  const openAccounts = db
    .select()
    .from(accounts)
    .where(and(eq(accounts.onBudget, true), isNull(accounts.archivedAt)))
    .all();
  const accountIds = new Set(openAccounts.map((row) => row.id));
  const schedules = activeSchedules(db);
  const amounts = scheduleAmounts(db, schedules, asOf);
  const links = db.select().from(occurrenceLinks).all();
  const skipped = new Set(links.filter((link) => link.skipped).map((link) => `${link.bucketId}|${link.dueDate}`));
  const posted = new Set(links.filter((link) => link.transactionId !== null).map((link) => `${link.bucketId}|${link.dueDate}`));
  const linkedTransactions = new Set(links.flatMap((link) => (link.transactionId ? [link.transactionId] : [])));
  const deltas: ForecastDelta[] = [];
  const flows: ForecastFlow[] = [];
  const transfersOut: ForecastFlow[] = [];
  for (const schedule of schedules) {
    const amount = amounts.get(schedule.id)?.forecast ?? schedule.expectedAmount;
    for (const date of occurrenceDates(schedule, horizonEnd, asOf)) {
      if (skipped.has(`${schedule.id}|${date.dueDate}`) || posted.has(`${schedule.id}|${date.dueDate}`)) {
        continue;
      }
      if (accountIds.has(schedule.accountId)) {
        deltas.push({ date: date.dueDate, amount, series: "known" });
        flows.push(...scheduleFlows(schedule, date.dueDate, amount));
        if (schedule.kind === "commitment" && schedule.transferAccountId && !accountIds.has(schedule.transferAccountId)) {
          transfersOut.push({ date: date.dueDate, income: 0, spending: -amount, bucketId: schedule.id });
        }
      }
      if (schedule.transferAccountId && accountIds.has(schedule.transferAccountId)) {
        deltas.push({ date: date.dueDate, amount: -amount, series: "known" });
      }
    }
  }
  for (const row of db
    .select({ accountId: transactions.accountId, date: transactions.date, amount: transactions.amount })
    .from(transactions)
    .where(and(gt(transactions.date, asOf), lte(transactions.date, horizonEnd)))
    .all()) {
    if (accountIds.has(row.accountId)) {
      deltas.push({ date: row.date, amount: row.amount, series: "known" });
    }
  }

  const months = lastCompleteMonths(db, asOf, 3);
  const bucketOf = new Map(db.select().from(bucketCategories).all().map((row) => [row.categoryId, row.bucketId]));
  const spending = db
    .select()
    .from(buckets)
    .all()
    .filter((row) => row.kind === "spending" && row.archivedAt === null && row.refillTo !== null);
  const expenseIds = new Set(
    db
      .select()
      .from(categories)
      .all()
      .filter((row) => row.kind === "expense" && row.archivedAt === null)
      .map((row) => row.id),
  );
  const lines = db
    .select({
      transactionId: transactions.id,
      accountId: transactions.accountId,
      date: transactions.date,
      amount: transactionLines.amount,
      categoryId: transactionLines.categoryId,
    })
    .from(transactionLines)
    .innerJoin(transactions, eq(transactionLines.transactionId, transactions.id))
    .where(and(isNotNull(transactionLines.categoryId)))
    .all();
  const monthly: { monthly: number; bucketId: string | null }[] = [];
  for (const bucket of spending) {
    const categoryIds = new Set([...bucketOf].filter(([, bucketId]) => bucketId === bucket.id).map(([categoryId]) => categoryId));
    // A spending bucket counts only when an open on-budget account has a line in its categories.
    const used = lines.some((line) => line.categoryId !== null && categoryIds.has(line.categoryId) && accountIds.has(line.accountId));
    if (used && bucket.refillTo) {
      monthly.push({ monthly: bucket.refillTo, bucketId: bucket.id });
    }
  }
  for (const categoryId of expenseIds) {
    if (bucketOf.has(categoryId)) {
      continue;
    }
    const rows = lines.filter(
      (line) =>
        line.categoryId === categoryId &&
        accountIds.has(line.accountId) &&
        !linkedTransactions.has(line.transactionId) &&
        months.some((month) => line.date.startsWith(month)),
    );
    const amount = unbucketedMonthly(
      months,
      rows.flatMap((line) => (line.categoryId ? [{ month: line.date.slice(0, 7), amount: line.amount }] : [])),
      step,
    );
    if (amount > 0) {
      monthly.push({ monthly: amount, bucketId: null });
    }
  }
  const variable = spendDeltas(dates, monthly, step);
  deltas.push(...variable);
  flows.push(...variable.map((delta) => ({ date: delta.date, income: 0, spending: -delta.amount, bucketId: delta.bucketId })));

  return {
    asOf,
    balance: balancesOf(db, openAccounts, asOf).reduce((sum, row) => sum + row.balance, 0),
    deltas,
    flows,
    transfersOut,
  };
}
