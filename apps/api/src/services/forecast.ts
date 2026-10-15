import { accounts, bucketCategories, buckets, categories, occurrenceLinks, transactionLines, transactions } from "@num/db";
import {
  buildForecast,
  cardPaymentDay,
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
import { and, asc, eq, gt, isNotNull, isNull, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Db } from "../db";
import { balancesOf } from "./account-balance";
import { lastCompleteMonths } from "./complete-months";
import { ServiceError } from "../service-error";
import { bookStep } from "./book-step";
import { activeSchedules, scheduleAmounts, type ScheduleView } from "./schedules";
import { literal } from "./transaction-sql";

const peer = alias(transactions, "peer");

function usualAccount(rows: readonly { accountId: string; date: string }[]) {
  const counts = new Map<string, { count: number; latest: string }>();
  for (const row of rows) {
    const current = counts.get(row.accountId) ?? { count: 0, latest: "" };
    current.count += 1;
    if (row.date > current.latest) {
      current.latest = row.date;
    }
    counts.set(row.accountId, current);
  }
  let best: { id: string; count: number; latest: string } | null = null;
  for (const [id, current] of counts) {
    if (!best || current.count > best.count || (current.count === best.count && current.latest > best.latest)) {
      best = { id, ...current };
    }
  }
  return best?.id ?? null;
}

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
    .orderBy(asc(accounts.name))
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
        deltas.push({ date: date.dueDate, accountId: schedule.accountId, amount, series: "known" });
        flows.push(...scheduleFlows(schedule, date.dueDate, amount));
        if (schedule.kind === "commitment" && schedule.transferAccountId && !accountIds.has(schedule.transferAccountId)) {
          transfersOut.push({ date: date.dueDate, income: 0, spending: -amount, bucketId: schedule.id });
        }
      }
      if (schedule.transferAccountId && accountIds.has(schedule.transferAccountId)) {
        deltas.push({ date: date.dueDate, accountId: schedule.transferAccountId, amount: -amount, series: "known" });
      }
    }
  }
  for (const row of db
    .select({ accountId: transactions.accountId, date: transactions.date, amount: transactions.amount })
    .from(transactions)
    .where(and(gt(transactions.date, asOf), lte(transactions.date, horizonEnd)))
    .all()) {
    if (accountIds.has(row.accountId)) {
      deltas.push({ date: row.date, accountId: row.accountId, amount: row.amount, series: "known" });
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
  const monthly: { accountId: string; monthly: number; bucketId: string | null }[] = [];
  for (const bucket of spending) {
    const categoryIds = new Set([...bucketOf].filter(([, bucketId]) => bucketId === bucket.id).map(([categoryId]) => categoryId));
    const rows = lines.filter((line) => line.categoryId !== null && categoryIds.has(line.categoryId) && accountIds.has(line.accountId));
    const accountId = usualAccount(rows);
    if (accountId && bucket.refillTo) {
      monthly.push({ accountId, monthly: bucket.refillTo, bucketId: bucket.id });
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
    const accountId = usualAccount(rows.filter((line) => accountIds.has(line.accountId)));
    if (accountId && amount > 0) {
      monthly.push({ accountId, monthly: amount, bucketId: null });
    }
  }
  const variable = spendDeltas(dates, monthly, step);
  deltas.push(...variable);
  flows.push(...variable.map((delta) => ({ date: delta.date, income: 0, spending: -delta.amount, bucketId: delta.bucketId })));

  const warnings: Forecast["warnings"] = [];
  const cards = [];
  for (const account of openAccounts) {
    const policy = account.paymentPolicy;
    if (account.kind !== "credit_card" || policy === null) {
      continue;
    }
    const payments = db
      .select({ date: transactions.date, accountId: peer.accountId })
      .from(transactions)
      .innerJoin(peer, eq(peer.id, transactions.transferPeerId))
      .where(and(eq(transactions.accountId, account.id), gt(transactions.amount, literal(0))))
      .all();
    const paymentDay = cardPaymentDay(
      payments.map((row) => row.date),
      asOf,
    );
    if (policy === "manual" || paymentDay === null) {
      warnings.push({ code: "manual_card", accountId: account.id });
    }
    const paymentAccountId = usualAccount(payments);
    cards.push({ accountId: account.id, paymentAccountId, policy, fixedPayment: account.fixedPayment, paymentDay });
  }

  return {
    asOf,
    warnings,
    accounts: balancesOf(db, openAccounts, asOf).map(({ account, balance }) => ({
      id: account.id,
      kind: account.kind,
      balance,
    })),
    deltas,
    flows,
    cards,
    transfersOut,
  };
}
