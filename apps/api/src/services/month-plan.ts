import { bucketCategories, bucketEvents, buckets, fundingRuns, occurrenceLinks, recurringPlans, transactionLines, transactions } from "@num/db";
import {
  bucketColors,
  bucketKinds,
  buildMonthPlan,
  businessDayShifts,
  isIsoDate,
  isYearMonth,
  Temporal,
  planFrequencies,
  planKinds,
  type AmountMode,
  type BucketColor,
  type BucketKind,
  type BusinessDayShift,
  type MonthPlan,
  type MonthPlanBucketSource,
  type MonthPlanLink,
  type MonthPlanSource,
  type PlanKind,
  type PlanSchedule,
} from "@num/shared";
import { and, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "../db";
import { integerSum } from "../integer-sum";
import { ServiceError } from "../service-error";

type PlanRow = typeof recurringPlans.$inferSelect;
type BucketRow = typeof buckets.$inferSelect;

function oneOf<T extends string>(value: string, allowed: readonly T[], label: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(label);
  }
  return value as T;
}

function scheduleOf(row: PlanRow): PlanSchedule {
  return {
    startDate: row.startDate,
    endDate: row.endDate,
    freq: oneOf(row.freq, planFrequencies, "Unknown frequency"),
    interval: row.interval,
    monthDay: row.monthDay,
    businessDayShift: oneOf(row.businessDayShift, businessDayShifts, "Unknown shift") as BusinessDayShift,
  };
}

function planOf(row: PlanRow): MonthPlanSource {
  return {
    id: row.id,
    name: row.name,
    kind: oneOf(row.kind, planKinds, "Unknown plan kind") as PlanKind,
    amountMode: oneOf(row.amountMode, ["fixed", "variable"] as const, "Unknown amount mode") as AmountMode,
    expectedAmount: row.expectedAmount,
    fundsBuckets: row.fundsBuckets,
    active: row.active,
    archived: row.archivedAt !== null,
    schedule: scheduleOf(row),
  };
}

function bucketOf(row: BucketRow, actualFunded: number): MonthPlanBucketSource {
  return {
    id: row.id,
    name: row.name,
    kind: oneOf(row.kind, bucketKinds, "Unknown bucket kind") as BucketKind,
    priority: row.priority,
    color: oneOf(row.color, bucketColors, "Unknown bucket color") as BucketColor,
    archived: row.archivedAt !== null,
    balance: 0,
    refillTo: row.refillTo,
    amount: row.amount,
    dueDate: row.dueDate,
    target: row.target,
    targetDate: row.targetDate,
    fixedAmount: row.fixedAmount,
    actualFunded,
  };
}

function monthEnd(month: string): { start: string; end: string } {
  const start = Temporal.PlainDate.from(`${month}-01`);
  return { start: start.toString(), end: start.with({ day: start.daysInMonth }).toString() };
}

export function readMonthPlan(db: Db, asOf: string, month: string | undefined): MonthPlan {
  if (!isIsoDate(asOf)) {
    throw new ServiceError("as_of_invalid", 400, { asOf });
  }
  const selected = month ?? asOf.slice(0, 7);
  if (!isYearMonth(selected)) {
    throw new ServiceError("month_invalid", 400, { month: selected });
  }
  const range = monthEnd(selected);
  const origin = selected < asOf.slice(0, 7) ? selected : asOf.slice(0, 7);
  const originStart = `${origin}-01`;
  const plans = db.select().from(recurringPlans).all().map(planOf);
  const links = loadLinks(db, asOf, originStart, range.end);
  const funded = new Map<string, number>();
  const events = db
    .select({ bucketId: bucketEvents.bucketId, amount: bucketEvents.amount })
    .from(bucketEvents)
    .leftJoin(fundingRuns, eq(bucketEvents.fundingRunId, fundingRuns.id))
    .where(
      and(
        eq(bucketEvents.kind, "fund"),
        gte(bucketEvents.date, range.start),
        lte(bucketEvents.date, range.end),
        isNull(bucketEvents.undoneAt),
        or(isNull(bucketEvents.fundingRunId), isNull(fundingRuns.undoneAt)),
      ),
    )
    .all();
  for (const event of events) {
    funded.set(event.bucketId, (funded.get(event.bucketId) ?? 0) + event.amount);
  }
  const balances = balancesBefore(db, originStart);
  const sources = db
    .select()
    .from(buckets)
    .all()
    .map((row) => {
      const source = bucketOf(row, funded.get(row.id) ?? 0);
      source.balance = balances.get(row.id) ?? 0;
      return source;
    });
  return buildMonthPlan({ month: selected, asOf, plans, links, buckets: sources });
}

function loadLinks(db: Db, asOf: string, windowStart: string, windowEnd: string): MonthPlanLink[] {
  const windowRows = db
    .select()
    .from(occurrenceLinks)
    .where(and(gte(occurrenceLinks.dueDate, windowStart), lte(occurrenceLinks.dueDate, windowEnd)))
    .all();
  const recent = db.all<{ planId: string; dueDate: string; amount: number }>(sql`
    select plan_id as planId, due_date as dueDate, amount
    from (
      select l.plan_id, l.due_date, t.amount,
             row_number() over (partition by l.plan_id order by l.due_date desc) as n
      from occurrence_links l
      inner join transactions t on t.id = l.transaction_id and t.deleted_at is null
      where l.skipped = 0 and l.due_date <= ${asOf}
    )
    where n <= 6
  `);
  const txnIds = windowRows.flatMap((row) => (row.transactionId ? [row.transactionId] : []));
  const amounts = new Map<string, number>();
  if (txnIds.length > 0) {
    for (const row of db
      .select({ id: transactions.id, amount: transactions.amount, deletedAt: transactions.deletedAt })
      .from(transactions)
      .where(inArray(transactions.id, txnIds))
      .all()) {
      if (row.deletedAt === null) {
        amounts.set(row.id, row.amount);
      }
    }
  }
  const links = new Map<string, MonthPlanLink>();
  for (const row of recent) {
    links.set(`${row.planId}|${row.dueDate}`, { planId: row.planId, dueDate: row.dueDate, skipped: false, actual: row.amount });
  }
  for (const row of windowRows) {
    const actual = row.skipped || row.transactionId === null ? null : (amounts.get(row.transactionId) ?? null);
    links.set(`${row.planId}|${row.dueDate}`, { planId: row.planId, dueDate: row.dueDate, skipped: row.skipped, actual });
  }
  return [...links.values()];
}

function balancesBefore(db: Db, start: string): Map<string, number> {
  const balances = new Map<string, number>();
  const add = (id: string, amount: number) => balances.set(id, (balances.get(id) ?? 0) + amount);
  const events = db
    .select({
      kind: bucketEvents.kind,
      bucketId: bucketEvents.bucketId,
      otherBucketId: bucketEvents.otherBucketId,
      amount: bucketEvents.amount,
    })
    .from(bucketEvents)
    .leftJoin(fundingRuns, eq(bucketEvents.fundingRunId, fundingRuns.id))
    .where(and(lt(bucketEvents.date, start), isNull(bucketEvents.undoneAt), or(isNull(bucketEvents.fundingRunId), isNull(fundingRuns.undoneAt))))
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
    .where(and(isNull(transactions.deletedAt), lt(transactions.date, start)))
    .groupBy(bucketCategories.bucketId)
    .all();
  for (const line of lines) {
    add(line.bucketId, integerSum(line.total));
  }
  return balances;
}
