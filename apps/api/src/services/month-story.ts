import { buckets, occurrenceLinks, recurringPlans, transactions } from "@num/db";
import {
  buildMonthStory,
  businessDayShifts,
  isIsoDate,
  isMonthKey,
  monthStorySchema,
  occurrenceDates,
  planFrequencies,
  storyThrough,
  priorMonths,
  type BusinessDayShift,
  type MonthStory,
  type PlanFrequency,
  type PlanSchedule,
  type StoryLine,
  type StoryOccurrence,
} from "@num/shared";
import { sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { bucketBalances } from "./bucket-balance";
import { loadLedgerLines } from "./ledger-lines";

type PlanRow = typeof recurringPlans.$inferSelect;

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

function storyLines(db: Db, from: string, through: string): StoryLine[] {
  return loadLedgerLines(db, { from, through }).map((row) => ({
    month: row.month,
    amount: row.amount,
    categoryId: row.categoryId,
    kind: row.kind,
    transfer: row.transfer,
  }));
}

function storyOccurrences(db: Db, month: string, through: string): StoryOccurrence[] {
  const plans = db.select().from(recurringPlans).all();
  const links = db.select().from(occurrenceLinks).all();
  const amounts = new Map(
    db
      .select({ id: transactions.id, amount: transactions.amount })
      .from(transactions)
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

export function loadMonthStory(db: Db, month: string, asOf: string): MonthStory {
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
    where merchant_id is not null
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
  });
  return monthStorySchema.parse(story);
}
