import { bucketEvents, buckets, fundingRuns, occurrenceLinks, recurringPlans, transactions } from "@num/db";
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
import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import type { Db } from "../db";
import { bucketBalances } from "./bucket-balance";
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
    throw new ServiceError("as_of_invalid", 400, { month: selected });
  }
  const range = monthEnd(selected);
  const plans = db.select().from(recurringPlans).all().map(planOf);
  const linkRows = db.select().from(occurrenceLinks).all();
  const txnIds = linkRows.flatMap((row) => (row.transactionId ? [row.transactionId] : []));
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
  const links: MonthPlanLink[] = linkRows.map((row) => ({
    planId: row.planId,
    dueDate: row.dueDate,
    skipped: row.skipped,
    actual: row.transactionId ? (amounts.get(row.transactionId) ?? null) : null,
  }));
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
  const balances = bucketBalances(db);
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
