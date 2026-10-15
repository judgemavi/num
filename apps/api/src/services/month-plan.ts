import { bucketEvents, buckets, occurrenceLinks, transactions, type BucketRow } from "@num/db";
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
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "../db";
import { bookStep } from "./book-step";
import { ServiceError } from "../service-error";
import { bucketBalances } from "./bucket-balance";
import { monthlyEssential } from "./emergency-fund";
import { commitmentsOf, loadSchedules, type ScheduleView } from "./schedules";
import { literal } from "./transaction-sql";

function planOf(row: ScheduleView): MonthPlanSource {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    amountMode: row.amountMode,
    expectedAmount: row.expectedAmount,
    archived: row.archivedAt !== null,
    schedule: row,
  };
}

function bucketOf(row: BucketRow, actualFunded: number, essentialMonthly: number, commitment: MonthPlanBucketSource["commitment"]): MonthPlanBucketSource {
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
    repeat: row.repeat,
    target: row.kind === "emergency" ? (row.months ?? 0) * essentialMonthly : row.target,
    targetDate: row.targetDate,
    fixedAmount: row.fixedAmount,
    fillMonths: row.fillMonths,
    startDate: row.startDate,
    actualFunded,
    commitment,
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
  const plans = loadSchedules(db).map(planOf);
  const links = loadLinks(db, asOf, originStart, range.end);
  const funded = new Map<string, number>();
  const events = db
    .select({ bucketId: bucketEvents.bucketId, amount: bucketEvents.amount })
    .from(bucketEvents)
    .where(and(eq(bucketEvents.kind, "fund"), eq(bucketEvents.month, selected), isNull(bucketEvents.undoneAt)))
    .all();
  for (const event of events) {
    funded.set(event.bucketId, (funded.get(event.bucketId) ?? 0) + event.amount);
  }
  const balances = bucketBalances(db, Temporal.PlainDate.from(originStart).subtract({ days: 1 }).toString());
  const rows = db.select().from(buckets).all();
  const essentialMonthly = rows.some((row) => row.kind === "emergency" && row.archivedAt === null) ? monthlyEssential(db, originStart).monthly : 0;
  const commitments = commitmentsOf(db, originStart);
  const sources = rows.map((row) => {
    const source = bucketOf(row, funded.get(row.id) ?? 0, essentialMonthly, commitments.get(row.id) ?? null);
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
      bucketId: occurrenceLinks.bucketId,
      dueDate: occurrenceLinks.dueDate,
      amount: transactions.amount,
      rank: sql<number>`row_number() over (partition by ${occurrenceLinks.bucketId} order by ${occurrenceLinks.dueDate} desc)`.as("rank"),
    })
    .from(occurrenceLinks)
    .innerJoin(transactions, eq(transactions.id, occurrenceLinks.transactionId))
    .where(and(eq(occurrenceLinks.skipped, literal(0)), lte(occurrenceLinks.dueDate, asOf)))
    .as("ranked");
  const recent = db
    .select({ bucketId: ranked.bucketId, dueDate: ranked.dueDate, amount: ranked.amount })
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
    links.set(`${row.bucketId}|${row.dueDate}`, { bucketId: row.bucketId, dueDate: row.dueDate, skipped: false, actual: row.amount });
  }
  for (const row of windowRows) {
    const actual = row.skipped || row.transactionId === null ? null : (amounts.get(row.transactionId) ?? null);
    links.set(`${row.bucketId}|${row.dueDate}`, { bucketId: row.bucketId, dueDate: row.dueDate, skipped: row.skipped, actual });
  }
  return [...links.values()];
}
