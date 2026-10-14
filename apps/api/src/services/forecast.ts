import { accounts, bucketCategories, buckets, categories, checkpoints, occurrenceLinks, recurringPlans, settings, transactionLines, transactions, type RecurringPlanRow } from "@num/db";
import {
  buildForecast,
  cardForecastSchedule,
  forecastDates,
  isIsoDate,
  nextIncomeDate,
  occurrenceDates,
  spendDeltas,
  unbucketedMonthly,
  Temporal,
  variableAmounts,
  type Forecast,
  type ForecastDelta,
  type ForecastFlow,
} from "@num/shared";
import { and, asc, eq, gt, isNotNull, isNull, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Db } from "../db";
import { balancesOf } from "./account-balance";
import { lastCompleteMonths } from "./complete-months";
import { ServiceError } from "../service-error";
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

function bufferOf(db: Db) {
  const row = db.select().from(settings).where(eq(settings.key, "bufferAmount")).get();
  if (!row || !/^\d+$/.test(row.value)) {
    return 0;
  }
  const value = Number(row.value);
  return Number.isSafeInteger(value) ? value : 0;
}

function planAmount(plan: RecurringPlanRow, links: { planId: string; dueDate: string; transactionId: string | null }[], amounts: Map<string, number>, asOf: string) {
  if (plan.amountMode !== "variable") {
    return plan.expectedAmount;
  }
  const actuals = links
    .filter((link) => link.planId === plan.id && link.transactionId !== null && link.dueDate <= asOf)
    .sort((left, right) => (left.dueDate < right.dueDate ? 1 : left.dueDate > right.dueDate ? -1 : 0))
    .flatMap((link) => {
      const amount = link.transactionId ? amounts.get(link.transactionId) : undefined;
      return amount === undefined ? [] : [amount];
    });
  return variableAmounts(actuals, plan.expectedAmount).forecast;
}

function planFlows(kind: string, date: string, amount: number): ForecastFlow[] {
  if (kind === "income") {
    return [{ date, income: amount, spending: 0 }];
  }
  if (kind === "bill") {
    return [{ date, income: 0, spending: -amount }];
  }
  return [];
}

export function readForecast(db: Db, asOf: string): Forecast {
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
  const plans = db
    .select()
    .from(recurringPlans)
    .all()
    .filter((row) => row.active && row.archivedAt === null);
  const links = db.select().from(occurrenceLinks).all();
  const skipped = new Set(links.filter((link) => link.skipped).map((link) => `${link.planId}|${link.dueDate}`));
  const posted = new Set(links.filter((link) => link.transactionId !== null).map((link) => `${link.planId}|${link.dueDate}`));
  const linkedTransactions = new Set(links.flatMap((link) => (link.transactionId ? [link.transactionId] : [])));
  const amounts = new Map(
    db
      .select({ id: transactions.id, amount: transactions.amount })
      .from(occurrenceLinks)
      .innerJoin(transactions, eq(transactions.id, occurrenceLinks.transactionId))
      .all()
      .map((row) => [row.id, row.amount]),
  );
  const deltas: ForecastDelta[] = [];
  const flows: ForecastFlow[] = [];
  const incomeDates: string[] = [];
  const incomeHorizon = Temporal.PlainDate.from(asOf).add({ years: 1 }).toString();
  for (const plan of plans) {
    const amount = planAmount(plan, links, amounts, asOf);
    if (plan.kind === "income" && plan.fundsBuckets) {
      for (const date of occurrenceDates(plan, incomeHorizon, asOf)) {
        if (!skipped.has(`${plan.id}|${date.dueDate}`)) {
          incomeDates.push(date.dueDate);
        }
      }
    }
    for (const date of occurrenceDates(plan, horizonEnd, asOf)) {
      if (skipped.has(`${plan.id}|${date.dueDate}`) || posted.has(`${plan.id}|${date.dueDate}`)) {
        continue;
      }
      if (accountIds.has(plan.accountId)) {
        deltas.push({ date: date.dueDate, accountId: plan.accountId, amount, series: "known" });
        flows.push(...planFlows(plan.kind, date.dueDate, amount));
      }
      if (plan.kind === "transfer" && plan.transferAccountId && accountIds.has(plan.transferAccountId)) {
        deltas.push({ date: date.dueDate, accountId: plan.transferAccountId, amount: -amount, series: "known" });
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
  const monthly: { accountId: string; monthly: number }[] = [];
  for (const bucket of spending) {
    const categoryIds = new Set([...bucketOf].filter(([, bucketId]) => bucketId === bucket.id).map(([categoryId]) => categoryId));
    const rows = lines.filter((line) => line.categoryId !== null && categoryIds.has(line.categoryId) && accountIds.has(line.accountId));
    const accountId = usualAccount(rows);
    if (accountId && bucket.refillTo) {
      monthly.push({ accountId, monthly: bucket.refillTo });
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
    );
    const accountId = usualAccount(rows.filter((line) => accountIds.has(line.accountId)));
    if (accountId && amount > 0) {
      monthly.push({ accountId, monthly: amount });
    }
  }
  const variable = spendDeltas(dates, monthly);
  deltas.push(...variable);
  flows.push(...variable.map((delta) => ({ date: delta.date, income: 0, spending: -delta.amount })));

  const warnings: Forecast["warnings"] = [];
  const cards = [];
  for (const account of openAccounts) {
    const policy = account.paymentPolicy;
    if (account.kind !== "credit_card" || policy === null) {
      continue;
    }
    if (policy === "manual") {
      warnings.push({ code: "manual_card", accountId: account.id });
    }
    const statements = db
      .select({ date: checkpoints.date, balance: checkpoints.statementBalance })
      .from(checkpoints)
      .where(and(eq(checkpoints.accountId, account.id), isNull(checkpoints.unlockedAt)))
      .all();
    const payments = db
      .select({ date: transactions.date, amount: transactions.amount, accountId: peer.accountId })
      .from(transactions)
      .innerJoin(peer, eq(peer.id, transactions.transferPeerId))
      .where(and(eq(transactions.accountId, account.id), gt(transactions.amount, literal(0))))
      .all();
    const fromHistory = usualAccount(payments);
    const chequing = openAccounts.filter((row) => row.kind === "chequing");
    const paymentAccountId = fromHistory ?? (chequing.length === 1 ? chequing[0]?.id ?? null : null);
    if (policy !== "manual" && statements.length > 0 && paymentAccountId === null) {
      warnings.push({ code: "no_payment_account", accountId: account.id });
    }
    const schedule = cardForecastSchedule({
      statements,
      payments: payments.map((row) => ({ date: row.date, amount: row.amount })),
      asOf,
      horizonEnd,
      policy,
      fixedPayment: account.fixedPayment,
    });
    cards.push({ accountId: account.id, paymentAccountId, policy, fixedPayment: account.fixedPayment, ...schedule });
  }

  const forecast = buildForecast({
    asOf,
    bufferAmount: bufferOf(db),
    nextIncomeDate: nextIncomeDate(asOf, incomeDates),
    warnings,
    accounts: balancesOf(db, openAccounts, asOf).map(({ account, balance }) => ({
      id: account.id,
      kind: account.kind,
      balance,
    })),
    deltas,
    flows,
    cards,
  });
  return forecast;
}
