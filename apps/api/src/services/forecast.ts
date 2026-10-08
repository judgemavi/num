import {
  accounts,
  bucketCategories,
  buckets,
  categories,
  checkpoints,
  monthCloses,
  occurrenceLinks,
  recurringPlans,
  settings,
  transactionLines,
  transactions,
  valuations,
} from "@num/db";
import {
  accountKinds,
  buildForecast,
  cardForecastSchedule,
  forecastDates,
  isIsoDate,
  monthEnd,
  nextIncomeDate,
  occurrenceDates,
  planFrequencies,
  businessDayShifts,
  spendDeltas,
  unbucketedMonthly,
  Temporal,
  variableAmounts,
  type AccountKind,
  type BusinessDayShift,
  type Forecast,
  type ForecastDelta,
  type PaymentPolicy,
  type PlanFrequency,
  type PlanSchedule,
} from "@num/shared";
import { and, eq, gt, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "../db";
import { integerSum } from "../integer-sum";
import { storeForecastSnapshot } from "./forecast-snapshot";
import { ServiceError } from "../service-error";
import { type AuditSource } from "./write";

type PlanRow = typeof recurringPlans.$inferSelect;

type WriteInput = {
  source: AuditSource;
  at?: string;
};

const paymentPolicies = ["full", "fixed", "manual"] as const;

function asKind(value: string): AccountKind {
  if (!(accountKinds as readonly string[]).includes(value)) {
    throw new Error("Unknown account kind");
  }
  return value as AccountKind;
}

function asPolicy(value: string | null): PaymentPolicy | null {
  if (value === null) {
    return null;
  }
  if (!(paymentPolicies as readonly string[]).includes(value)) {
    throw new Error("Unknown payment policy");
  }
  return value as PaymentPolicy;
}

function scheduleOf(row: PlanRow): PlanSchedule {
  if (!(planFrequencies as readonly string[]).includes(row.freq)) {
    throw new Error("Unknown frequency");
  }
  if (!(businessDayShifts as readonly string[]).includes(row.businessDayShift)) {
    throw new Error("Unknown shift");
  }
  return {
    startDate: row.startDate,
    endDate: row.endDate,
    freq: row.freq as PlanFrequency,
    interval: row.interval,
    monthDay: row.monthDay,
    businessDayShift: row.businessDayShift as BusinessDayShift,
  };
}

function usualAccount(rows: readonly { accountId: string; date: string }[]): string | null {
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

function bufferOf(db: Db): number {
  const row = db.select().from(settings).where(eq(settings.key, "bufferAmount")).get();
  if (!row || !/^\d+$/.test(row.value)) {
    return 0;
  }
  const value = Number(row.value);
  return Number.isSafeInteger(value) ? value : 0;
}

function closedMonths(db: Db): string[] {
  return db
    .select()
    .from(monthCloses)
    .all()
    .filter((row) => row.reopenedAt === null)
    .map((row) => row.month)
    .sort()
    .slice(-3);
}

export function balanceAsOf(
  db: Db,
  account: { id: string; kind: AccountKind; openingBalance: number },
  asOf?: string,
): number {
  const total = db
    .select({ total: sql<unknown>`coalesce(sum(${transactions.amount}), 0)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, account.id),
        isNull(transactions.deletedAt),
        asOf ? lte(transactions.date, asOf) : undefined,
      ),
    )
    .get();
  if (account.kind !== "investment" && account.kind !== "property") {
    return account.openingBalance + integerSum(total?.total);
  }
  const marks = db
    .select({ date: valuations.date, balance: valuations.balance })
    .from(valuations)
    .where(
      and(eq(valuations.accountId, account.id), isNull(valuations.deletedAt), asOf ? lte(valuations.date, asOf) : undefined),
    )
    .all();
  const latest = marks.sort((left, right) => (left.date < right.date ? 1 : -1))[0];
  if (!latest) {
    return account.openingBalance + integerSum(total?.total);
  }
  const after = db
    .select({ total: sql<unknown>`coalesce(sum(${transactions.amount}), 0)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, account.id),
        isNull(transactions.deletedAt),
        gt(transactions.date, latest.date),
        asOf ? lte(transactions.date, asOf) : undefined,
      ),
    )
    .get();
  return latest.balance + integerSum(after?.total);
}

function planAmount(plan: PlanRow, links: { planId: string; dueDate: string; transactionId: string | null }[], amounts: Map<string, number>, asOf: string): number {
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

export function readForecastOnly(db: Db, asOf: string): Forecast {
  if (!isIsoDate(asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf });
  }
  const dates = forecastDates(asOf);
  const horizonEnd = dates[dates.length - 1] ?? asOf;
  const openAccounts = db
    .select()
    .from(accounts)
    .all()
    .filter((row) => row.onBudget && row.archivedAt === null)
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
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
  const amounts = new Map<string, number>();
  if (linkedTransactions.size > 0) {
    for (const row of db
      .select({ id: transactions.id, amount: transactions.amount, deletedAt: transactions.deletedAt })
      .from(transactions)
      .all()) {
      if (row.deletedAt === null && linkedTransactions.has(row.id)) {
        amounts.set(row.id, row.amount);
      }
    }
  }
  const deltas: ForecastDelta[] = [];
  const incomeDates: string[] = [];
  const incomeHorizon = Temporal.PlainDate.from(asOf).add({ years: 1 }).toString();
  for (const plan of plans) {
    const amount = planAmount(plan, links, amounts, asOf);
    const schedule = scheduleOf(plan);
    if (plan.kind === "income" && plan.fundsBuckets) {
      for (const date of occurrenceDates(schedule, incomeHorizon, asOf)) {
        if (!skipped.has(`${plan.id}|${date.dueDate}`)) {
          incomeDates.push(date.dueDate);
        }
      }
    }
    for (const date of occurrenceDates(schedule, horizonEnd, asOf)) {
      if (skipped.has(`${plan.id}|${date.dueDate}`) || posted.has(`${plan.id}|${date.dueDate}`)) {
        continue;
      }
      if (accountIds.has(plan.accountId)) {
        deltas.push({ date: date.dueDate, accountId: plan.accountId, amount, series: "known" });
      }
      if (plan.kind === "transfer" && plan.transferAccountId && accountIds.has(plan.transferAccountId)) {
        deltas.push({ date: date.dueDate, accountId: plan.transferAccountId, amount: -amount, series: "known" });
      }
    }
  }
  for (const row of db
    .select({ accountId: transactions.accountId, date: transactions.date, amount: transactions.amount })
    .from(transactions)
    .where(and(isNull(transactions.deletedAt), gt(transactions.date, asOf), lte(transactions.date, horizonEnd)))
    .all()) {
    if (accountIds.has(row.accountId)) {
      deltas.push({ date: row.date, accountId: row.accountId, amount: row.amount, series: "known" });
    }
  }

  const months = closedMonths(db);
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
    .where(and(isNull(transactions.deletedAt), isNotNull(transactionLines.categoryId)))
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
  deltas.push(...spendDeltas(dates, monthly));

  const warnings: Forecast["warnings"] = [];
  const cards = [];
  for (const account of openAccounts) {
    const policy = asPolicy(account.paymentPolicy);
    if (asKind(account.kind) !== "credit_card" || policy === null) {
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
    const payments = db.all<{ date: string; amount: number; accountId: string }>(sql`
      select t.date as date, t.amount as amount, peer.account_id as accountId
      from transactions t
      inner join transactions peer on peer.id = t.transfer_peer_id
      where t.account_id = ${account.id}
        and t.deleted_at is null
        and t.amount > 0
        and peer.deleted_at is null
    `);
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
    accounts: openAccounts.map((row) => ({
      id: row.id,
      kind: asKind(row.kind),
      balance: balanceAsOf(db, { id: row.id, kind: asKind(row.kind), openingBalance: row.openingBalance }, asOf),
    })),
    deltas,
    cards,
  });
  return forecast;
}

export function readForecast(db: Db, asOf: string, input: WriteInput): Forecast {
  const forecast = readForecastOnly(db, asOf);
  const end = monthEnd(asOf);
  const endIndex = forecast.dates.indexOf(end);
  storeForecastSnapshot(db, asOf, forecast.total.estimated[endIndex] ?? forecast.total.estimated[0] ?? 0, input);
  return forecast;
}
