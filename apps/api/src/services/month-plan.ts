import { bucketEvents, buckets, fundingRuns, occurrenceLinks, recurringPlans, transactions, type BucketRow, type RecurringPlanRow } from "@num/db";
import {
  buildMonthPlan,
  isIsoDate,
  isYearMonth,
  Temporal,
  type MonthPlan,
  type MonthPlanBucketSource,
  type MonthPlanLink,
  type MonthPlanSource,
} from "@num/shared";
import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { Db } from "../db";
import { bookStep } from "./book-step";
import { ServiceError } from "../service-error";
import { bucketBalances } from "./bucket-balance";
import { literal } from "./transaction-sql";

function planOf(row: RecurringPlanRow): MonthPlanSource {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    amountMode: row.amountMode,
    expectedAmount: row.expectedAmount,
    fundsBuckets: row.fundsBuckets,
    active: row.active,
    archived: row.archivedAt !== null,
    schedule: row,
  };
}

function bucketOf(row: BucketRow, actualFunded: number): MonthPlanBucketSource {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    priority: row.priority,
    color: row.color,
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

function monthEnd(month: string) {
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
  const balances = bucketBalances(db, Temporal.PlainDate.from(originStart).subtract({ days: 1 }).toString());
  const sources = db
    .select()
    .from(buckets)
    .all()
    .map((row) => {
      const source = bucketOf(row, funded.get(row.id) ?? 0);
      source.balance = balances.get(row.id) ?? 0;
      return source;
    });
  return buildMonthPlan({ month: selected, asOf, plans, links, buckets: sources, step: bookStep(db) });
}

function loadLinks(db: Db, asOf: string, windowStart: string, windowEnd: string) {
  const windowRows = db
    .select()
    .from(occurrenceLinks)
    .where(and(gte(occurrenceLinks.dueDate, windowStart), lte(occurrenceLinks.dueDate, windowEnd)))
    .all();
  const ranked = db
    .select({
      planId: occurrenceLinks.planId,
      dueDate: occurrenceLinks.dueDate,
      amount: transactions.amount,
      rank: sql<number>`row_number() over (partition by ${occurrenceLinks.planId} order by ${occurrenceLinks.dueDate} desc)`.as("rank"),
    })
    .from(occurrenceLinks)
    .innerJoin(transactions, eq(transactions.id, occurrenceLinks.transactionId))
    .where(and(eq(occurrenceLinks.skipped, literal(0)), lte(occurrenceLinks.dueDate, asOf)))
    .as("ranked");
  const recent = db
    .select({ planId: ranked.planId, dueDate: ranked.dueDate, amount: ranked.amount })
    .from(ranked)
    .where(lte(ranked.rank, literal(6)))
    .all();
  const txnIds = windowRows.flatMap((row) => (row.transactionId ? [row.transactionId] : []));
  const amounts = new Map<string, number>();
  if (txnIds.length > 0) {
    for (const row of db
      .select({ id: transactions.id, amount: transactions.amount })
      .from(transactions)
      .where(inArray(transactions.id, txnIds))
      .all()) {
      amounts.set(row.id, row.amount);
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
