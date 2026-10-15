import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { BucketKind } from "./bucket";
import { divideAmount } from "./currency";
import { isoDateSchema } from "./date";
import { monthKeySchema } from "./month";
import { occurrenceDates, type PlanSchedule } from "./recurring-calc";
import { amountSchema as money } from "./money";

const nonNegative = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export function addDays(iso: string, days: number): string {
  return Temporal.PlainDate.from(iso).add({ days }).toString();
}

export function nextIncomeDate(asOf: string, dates: readonly string[]): string | null {
  let next: string | null = null;
  for (const date of dates) {
    if (date <= asOf) {
      continue;
    }
    if (next === null || date < next) {
      next = date;
    }
  }
  return next;
}

export function positiveBalances(balances: readonly number[]): number {
  let total = 0;
  for (const balance of balances) {
    if (balance > 0) {
      total += balance;
    }
  }
  return total;
}

export function unassigned(onBudgetTotal: number, positiveBucketBalances: number): number {
  return onBudgetTotal - positiveBucketBalances;
}

/** The share of a shortfall for one month, rounded up to a whole number of minor units (`step`). */
export function roundUpShare(shortfall: number, months: number, step: number): number {
  if (shortfall <= 0) {
    return 0;
  }
  if (months <= 0) {
    return shortfall;
  }
  return divideAmount(shortfall, months, step, "up");
}

/** What the monthly amount of a commitment needs (decision 0062 item 5). `amount` is the safe amount, as a positive number. */
export type MonthlyCommitment = {
  schedule: PlanSchedule;
  amount: number;
  /** The due dates of the skipped occurrences. */
  skipped: ReadonlySet<string>;
  /** The date of the linked transaction of each paid occurrence, by due date. */
  paid: ReadonlyMap<string, string>;
};

export type MonthlyBucket = {
  kind: BucketKind;
  startDate: string;
  commitment: MonthlyCommitment | null;
  refillTo: number | null;
  amount: number | null;
  dueDate: string | null;
  repeat: "none" | "yearly" | null;
  /** The target of the bucket. For the emergency kind, the calculated target (decision 0060). */
  target: number | null;
  targetDate: string | null;
  fixedAmount: number | null;
  fillMonths: number | null;
};

/** The months from `month` (YYYY-MM) to the month of `date`. Zero or less when the date is in `month` or earlier. */
export function monthsUntil(month: string, date: string): number {
  const from = Temporal.PlainDate.from(`${month}-01`);
  const to = Temporal.PlainDate.from(`${date.slice(0, 7)}-01`);
  return from.until(to, { largestUnit: "month" }).months;
}

/**
 * The monthly amount of a bucket (decision 0059 item 1). `balance` is the balance at the start of `month`, without the
 * funding of that month. Each amount is rounded up to a whole minor unit (`step`).
 */
/** The due date that counts for `month`. A yearly bucket rolls a past due date forward by whole years. */
function dueDateFor(bucket: MonthlyBucket, month: string): string | null {
  let due = bucket.dueDate;
  if (due === null || bucket.repeat !== "yearly") {
    return due;
  }
  while (due.slice(0, 7) < month) {
    due = Temporal.PlainDate.from(due).add({ years: 1 }).toString();
  }
  return due;
}

/** Monthly or more often: weekly up to every 4 weeks, or monthly every month. */
function isFrequent(schedule: PlanSchedule) {
  return (schedule.freq === "weekly" && schedule.interval <= 4) || (schedule.freq === "monthly" && schedule.interval === 1);
}

function periodAfter(date: string, schedule: PlanSchedule) {
  const count = schedule.interval + 1;
  const start = Temporal.PlainDate.from(date);
  const end =
    schedule.freq === "weekly" ? start.add({ weeks: count }) : schedule.freq === "monthly" ? start.add({ months: count }) : start.add({ years: count });
  return end.toString();
}

/** The monthly amount of a commitment (decision 0062 item 5), from the occurrences on or after the start date of the bucket. */
function commitmentAmount(bucket: MonthlyBucket, commitment: MonthlyCommitment, balance: number, month: string, step: number): number {
  const monthFirst = `${month}-01`;
  const from = bucket.startDate > monthFirst ? bucket.startDate : monthFirst;
  const { schedule, skipped, paid } = commitment;
  // A skipped occurrence is not counted. An occurrence that was paid before the month is already in the opening balance.
  const counted = (item: { dueDate: string }) => !skipped.has(item.dueDate) && (paid.get(item.dueDate) ?? monthFirst) >= monthFirst;
  if (isFrequent(schedule)) {
    const monthLast = Temporal.PlainDate.from(monthFirst).with({ day: Temporal.PlainDate.from(monthFirst).daysInMonth }).toString();
    const due = occurrenceDates(schedule, monthLast, from).filter(counted);
    return Math.max(0, due.length * commitment.amount - balance);
  }
  const next = occurrenceDates(schedule, periodAfter(from, schedule), from).find(counted);
  if (!next) {
    return 0;
  }
  return roundUpShare(commitment.amount - balance, monthsUntil(month, next.dueDate), step);
}

export function monthlyAmount(bucket: MonthlyBucket, balance: number, month: string, step: number): number {
  if (bucket.kind === "income") {
    return 0;
  }
  if (bucket.kind === "commitment") {
    return bucket.commitment ? commitmentAmount(bucket, bucket.commitment, balance, month, step) : 0;
  }
  if (bucket.kind === "spending") {
    return Math.max(0, (bucket.refillTo ?? 0) - balance);
  }
  if (bucket.kind === "emergency") {
    const target = bucket.target ?? 0;
    return Math.min(roundUpShare(target, bucket.fillMonths ?? 1, step), Math.max(0, target - balance));
  }
  const goalDate = bucket.kind === "sinking" ? dueDateFor(bucket, month) : bucket.targetDate;
  if (bucket.kind === "goal" && goalDate === null) {
    return Math.min(Math.max(0, bucket.fixedAmount ?? 0), Math.max(0, (bucket.target ?? 0) - balance));
  }
  const total = bucket.kind === "sinking" ? (bucket.amount ?? 0) : (bucket.target ?? 0);
  return roundUpShare(total - balance, goalDate === null ? 0 : monthsUntil(month, goalDate), step);
}

export const fundingPositionSchema = z.object({
  asOf: isoDateSchema,
  onBudgetTotal: money,
  unassigned: money,
  nextIncomeDate: isoDateSchema.nullable(),
});

export const fillResultSchema = z.object({
  /** The total that this fill paid. 0 when nothing was owed or Unassigned was used. */
  paid: nonNegative,
  payments: nonNegative,
});

export const owedSchema = z.object({
  month: monthKeySchema,
  /** True when the user undid the funding of this month. The fill does not pay a held month. */
  held: z.boolean(),
  items: z.array(
    z.object({
      bucketId: z.uuid(),
      monthly: nonNegative,
      owed: nonNegative,
    }),
  ),
});

export const monthFundingSchema = z.object({
  month: monthKeySchema,
  /** The funding of the month that is not undone. */
  total: nonNegative,
  held: z.boolean(),
});

export const monthFundingListSchema = z.object({
  items: z.array(monthFundingSchema),
});

export const monthParamSchema = z.object({ month: monthKeySchema });

export type FundingPosition = z.infer<typeof fundingPositionSchema>;
export type FillResult = z.infer<typeof fillResultSchema>;
export type Owed = z.infer<typeof owedSchema>;
export type MonthFunding = z.infer<typeof monthFundingSchema>;
