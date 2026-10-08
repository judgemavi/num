import {
  accounts,
  bucketCategories,
  bucketEvents,
  buckets,
  categories,
  fundingRuns,
  occurrenceLinks,
  recurringPlans,
  transactionLines,
  transactions,
  valuations,
} from "@num/db";
import {
  accountKinds,
  buildMonthStory,
  businessDayShifts,
  isIsoDate,
  isMonthKey,
  monthStorySchema,
  occurrenceDates,
  planFrequencies,
  storyThrough,
  priorMonths,
  type AccountKind,
  type BusinessDayShift,
  type MonthStory,
  type PlanFrequency,
  type PlanSchedule,
  type StoryLine,
  type StoryOccurrence,
} from "@num/shared";
import { and, eq, gt, gte, isNull, lte, or, sql } from "drizzle-orm";
import type { Db } from "../db";
import { integerSum } from "../integer-sum";
import { ServiceError } from "../service-error";
import { accountBalance } from "./account-rules";

type PlanRow = typeof recurringPlans.$inferSelect;

function asAccountKind(value: string): AccountKind {
  if (!(accountKinds as readonly string[]).includes(value)) {
    throw new Error("Unknown account kind");
  }
  return value as AccountKind;
}

function asCategoryKind(value: string | null): StoryLine["kind"] {
  if (value === "income" || value === "expense") {
    return value;
  }
  return null;
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

function amountModeOf(value: string): StoryOccurrence["amountMode"] {
  if (value === "fixed" || value === "variable") {
    return value;
  }
  throw new Error("Unknown amount mode");
}

export function onBudgetTotal(db: Db, asOf: string): number {
  let total = 0;
  for (const account of db.select().from(accounts).all()) {
    if (!account.onBudget || account.archivedAt !== null) {
      continue;
    }
    total += balanceAsOf(db, account, asOf);
  }
  return total;
}

function balanceAsOf(db: Db, account: { id: string; kind: string; openingBalance: number }, asOf: string): number {
  const kind = asAccountKind(account.kind);
  const posted = db
    .select({ total: sql<unknown>`coalesce(sum(${transactions.amount}), 0)` })
    .from(transactions)
    .where(and(eq(transactions.accountId, account.id), isNull(transactions.deletedAt), lte(transactions.date, asOf)))
    .get();
  const transactionTotal = integerSum(posted?.total);
  if (kind !== "investment" && kind !== "property") {
    return accountBalance({ kind, openingBalance: account.openingBalance, transactionTotal, valuation: null });
  }
  const marks = db
    .select({ date: valuations.date, balance: valuations.balance })
    .from(valuations)
    .where(and(eq(valuations.accountId, account.id), isNull(valuations.deletedAt), lte(valuations.date, asOf)))
    .all();
  const latest = marks.sort((left, right) => (left.date < right.date ? 1 : -1))[0];
  if (!latest) {
    return accountBalance({ kind, openingBalance: account.openingBalance, transactionTotal, valuation: null });
  }
  const after = db
    .select({ total: sql<unknown>`coalesce(sum(${transactions.amount}), 0)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, account.id),
        isNull(transactions.deletedAt),
        gt(transactions.date, latest.date),
        lte(transactions.date, asOf),
      ),
    )
    .get();
  return accountBalance({
    kind,
    openingBalance: account.openingBalance,
    transactionTotal,
    valuation: { balance: latest.balance, transactionsAfter: integerSum(after?.total) },
  });
}

function bucketBalances(db: Db, asOf: string): Map<string, number> {
  const balances = new Map<string, number>();
  function add(id: string, amount: number) {
    balances.set(id, (balances.get(id) ?? 0) + amount);
  }
  const events = db
    .select({
      kind: bucketEvents.kind,
      bucketId: bucketEvents.bucketId,
      otherBucketId: bucketEvents.otherBucketId,
      amount: bucketEvents.amount,
    })
    .from(bucketEvents)
    .leftJoin(fundingRuns, eq(bucketEvents.fundingRunId, fundingRuns.id))
    .where(
      and(
        isNull(bucketEvents.undoneAt),
        lte(bucketEvents.date, asOf),
        or(isNull(bucketEvents.fundingRunId), isNull(fundingRuns.undoneAt)),
      ),
    )
    .all();
  for (const event of events) {
    if (event.kind === "fund") {
      add(event.bucketId, event.amount);
    } else if (event.kind === "release") {
      add(event.bucketId, -event.amount);
    } else if (event.kind === "move" && event.otherBucketId) {
      add(event.bucketId, -event.amount);
      add(event.otherBucketId, event.amount);
    }
  }
  const lines = db
    .select({
      bucketId: bucketCategories.bucketId,
      total: sql<unknown>`coalesce(sum(${transactionLines.amount}), 0)`,
    })
    .from(transactionLines)
    .innerJoin(transactions, eq(transactionLines.transactionId, transactions.id))
    .innerJoin(bucketCategories, eq(transactionLines.categoryId, bucketCategories.categoryId))
    .where(and(isNull(transactions.deletedAt), lte(transactions.date, asOf)))
    .groupBy(bucketCategories.bucketId)
    .all();
  for (const line of lines) {
    add(line.bucketId, integerSum(line.total));
  }
  return balances;
}

function storyLines(db: Db, from: string, through: string): StoryLine[] {
  return db
    .select({
      date: transactions.date,
      amount: transactionLines.amount,
      categoryId: transactionLines.categoryId,
      kind: categories.kind,
      transferAccountId: transactionLines.transferAccountId,
    })
    .from(transactionLines)
    .innerJoin(transactions, eq(transactionLines.transactionId, transactions.id))
    .leftJoin(categories, eq(transactionLines.categoryId, categories.id))
    .where(and(isNull(transactions.deletedAt), gte(transactions.date, from), lte(transactions.date, through)))
    .all()
    .map((row) => ({
      month: row.date.slice(0, 7),
      amount: row.amount,
      categoryId: row.categoryId,
      kind: asCategoryKind(row.kind),
      transfer: row.transferAccountId !== null,
    }));
}

function storyOccurrences(db: Db, month: string, through: string): StoryOccurrence[] {
  const plans = db.select().from(recurringPlans).all();
  const links = db.select().from(occurrenceLinks).all();
  const amounts = new Map(
    db
      .select({ id: transactions.id, amount: transactions.amount })
      .from(transactions)
      .where(isNull(transactions.deletedAt))
      .all()
      .map((row) => [row.id, row.amount]),
  );
  const linkByKey = new Map(links.map((link) => [`${link.planId}|${link.dueDate}`, link]));
  const rows: StoryOccurrence[] = [];
  for (const plan of plans) {
    for (const date of occurrenceDates(scheduleOf(plan), through, `${month}-01`)) {
      if (!date.dueDate.startsWith(`${month}-`)) {
        continue;
      }
      const link = linkByKey.get(`${plan.id}|${date.dueDate}`);
      const actual = link?.transactionId ? amounts.get(link.transactionId) : undefined;
      rows.push({
        planId: plan.id,
        dueDate: date.dueDate,
        expectedAmount: plan.expectedAmount,
        actualAmount: actual === undefined ? null : actual,
        skipped: link?.skipped === true,
        amountMode: amountModeOf(plan.amountMode),
        tolerance: plan.tolerance,
      });
    }
  }
  return rows;
}

export function loadMonthStory(db: Db, month: string, asOf: string, accuracy: MonthStory["accuracy"]): MonthStory {
  if (!isMonthKey(month)) {
    throw new ServiceError("month_invalid", 400, { month });
  }
  if (!isIsoDate(asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf });
  }
  const through = storyThrough(month, asOf);
  const from = `${priorMonths(month)[0]}-01`;
  const merchants = db.all<{ merchantId: string; firstDate: string }>(sql`
    select merchant_id as merchantId, min(date) as firstDate
    from transactions
    where deleted_at is null and merchant_id is not null
    group by merchant_id
  `);
  const balances = bucketBalances(db, through);
  const story = buildMonthStory({
    month,
    asOf,
    lines: storyLines(db, from, through),
    merchants: merchants.flatMap((row) =>
      row.firstDate <= through ? [{ merchantId: row.merchantId, firstMonth: row.firstDate.slice(0, 7) }] : [],
    ),
    occurrences: storyOccurrences(db, month, through),
    buckets: db
      .select()
      .from(buckets)
      .all()
      .filter((row) => row.archivedAt === null)
      .map((row) => ({ bucketId: row.id, balance: balances.get(row.id) ?? 0 })),
    accuracy,
  });
  return monthStorySchema.parse(story);
}
