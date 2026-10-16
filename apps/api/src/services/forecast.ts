import { loadLinkIndex } from "./link-index";
import { accounts, transactions } from "@num/db";
import {
  buildForecast,
  forecastDates,
  occurrenceDates,
  spendDeltas,
  type Forecast,
  type ForecastDelta,
  type ForecastFlow,
  type ForecastInput,
} from "@num/shared";
import { and, eq, gt, inArray, isNull, lte } from "drizzle-orm";
import type { Db } from "../db";
import { spendingCaps, unbucketedSpending } from "./forecast-spending";
import { balancesOf } from "./account-balance";
import { lastCompleteMonths } from "./complete-months";
import { bookStep } from "./book-step";
import { activeSchedules, scheduleAmounts, type ScheduleView } from "./schedules";

function scheduleFlows(schedule: ScheduleView, date: string, amount: number, debtAccounts: ReadonlySet<string>): ForecastFlow[] {
  if (schedule.kind === "income") {
    return [{ date, income: amount, spending: 0, bucketId: schedule.id }];
  }
  return (schedule.transferAccountId === null || debtAccounts.has(schedule.transferAccountId)) ? [{ date, income: 0, spending: -amount, bucketId: schedule.id }] : [];
}

export function readForecast(db: Db, asOf: string): Forecast {
  return buildForecast(forecastInput(db, asOf));
}

/**
 * The input of the forecast (spec §8). Each flow has its bucket: a commitment, an income or a spending bucket.
 * `transfersOut` are the commitment payments by transfer to an account that is not an open on-budget account (an
 * investment payment, for example). Debt payments are already in `flows`.
 */
export function forecastInput(db: Db, asOf: string, accountBalances?: ReadonlyMap<string, number>): ForecastInput & { transfersOut: ForecastFlow[] } {
  const step = bookStep(db);
  const dates = forecastDates(asOf);
  const horizonEnd = dates[dates.length - 1] ?? asOf;
  const openAccounts = db
    .select()
    .from(accounts)
    .where(and(eq(accounts.onBudget, true), isNull(accounts.archivedAt)))
    .all();
  const accountIds = new Set(openAccounts.map((row) => row.id));
  const debtAccounts = new Set(db.select({ id: accounts.id }).from(accounts)
    .where(inArray(accounts.kind, ["mortgage", "loan"])).all().map((row) => row.id));
  const schedules = activeSchedules(db);
  const amounts = scheduleAmounts(db, schedules, asOf);
  const { skippedKeys: skipped, postedKeys: posted } = loadLinkIndex(db);
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
        deltas.push({ date: date.dueDate, amount });
        flows.push(...scheduleFlows(schedule, date.dueDate, amount, debtAccounts));
        if (schedule.kind === "commitment" && schedule.transferAccountId && !accountIds.has(schedule.transferAccountId) && !debtAccounts.has(schedule.transferAccountId)) {
          transfersOut.push({ date: date.dueDate, income: 0, spending: -amount, bucketId: schedule.id });
        }
      }
      if (schedule.transferAccountId && accountIds.has(schedule.transferAccountId)) {
        deltas.push({ date: date.dueDate, amount: -amount });
      }
    }
  }
  for (const row of db
    .select({ accountId: transactions.accountId, date: transactions.date, amount: transactions.amount })
    .from(transactions)
    .where(and(gt(transactions.date, asOf), lte(transactions.date, horizonEnd)))
    .all()) {
    if (accountIds.has(row.accountId)) {
      deltas.push({ date: row.date, amount: row.amount });
    }
  }

  const months = lastCompleteMonths(db, asOf, 3);
  const monthly = [...spendingCaps(db), ...unbucketedSpending(db, months, step)];
  const variable = spendDeltas(dates, monthly, step);
  deltas.push(...variable);
  flows.push(...variable.map((delta) => ({ date: delta.date, income: 0, spending: -delta.amount, bucketId: delta.bucketId })));

  const balance = accountBalances
    ? openAccounts.reduce((sum, account) => {
        const amount = accountBalances.get(account.id);
        if (amount === undefined) throw new Error("Balance is missing");
        return sum + amount;
      }, 0)
    : balancesOf(db, openAccounts, asOf).reduce((sum, row) => sum + row.balance, 0);
  return {
    asOf,
    balance,
    deltas,
    flows,
    transfersOut,
  };
}
