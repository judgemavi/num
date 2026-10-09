import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { isoDateSchema, isIsoDate } from "./date";
import { medianMinor, withinTolerance } from "./recurring-calc";
import { centsSchema as cents } from "./money";


export const monthStatuses = ["open", "ready", "closed"] as const;

export type MonthStatus = (typeof monthStatuses)[number];

export const closeBlockerCodes = ["month_not_ended", "checkpoint_missing", "inbox_open"] as const;

export type CloseBlockerCode = (typeof closeBlockerCodes)[number];

export function isMonthKey(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value) && isIsoDate(`${value}-01`);
}

export const monthKeySchema = z.string().refine(isMonthKey);

export function monthLastDay(month: string): string {
  const date = Temporal.PlainDate.from(`${month}-01`);
  return date.with({ day: date.daysInMonth }).toString();
}

export function storyThrough(month: string, asOf: string): string {
  const end = monthLastDay(month);
  return asOf < end ? asOf : end;
}

export function priorMonths(month: string): [string, string, string] {
  const start = Temporal.PlainDate.from(`${month}-01`);
  const months = [3, 2, 1].map((count) => start.subtract({ months: count }).toString().slice(0, 7));
  return [months[0] ?? month, months[1] ?? month, months[2] ?? month];
}

const categoryChangeSchema = z.object({
  categoryId: z.uuid(),
  amount: cents,
  median: cents,
  delta: cents,
});

const recurringChangeSchema = z.object({
  planId: z.uuid(),
  dueDate: isoDateSchema,
  expectedAmount: cents,
  actualAmount: cents,
});

export const monthStorySchema = z.object({
  month: monthKeySchema,
  asOf: isoDateSchema,
  income: cents,
  spending: cents,
  savings: cents,
  savingsRateMilliPct: z.number().int().nullable(),
  uncategorized: z.object({
    count: z.number().int().nonnegative(),
    amount: cents,
  }),
  increases: z.array(categoryChangeSchema).max(3),
  decreases: z.array(categoryChangeSchema).max(3),
  newMerchants: z.array(z.object({ merchantId: z.uuid() })),
  recurringChanges: z.array(recurringChangeSchema),
  buckets: z.array(z.object({ bucketId: z.uuid(), balance: cents })),
  plan: z.array(z.object({ planId: z.uuid(), planned: cents, actual: cents })),
});

export type MonthStory = z.infer<typeof monthStorySchema>;

const blockerSchema = z.object({
  code: z.enum(closeBlockerCodes),
  accountId: z.uuid().nullable(),
});

export const monthListSchema = z.object({
  asOf: isoDateSchema,
  items: z.array(
    z.object({
      month: monthKeySchema,
      status: z.enum(monthStatuses),
      blockers: z.array(blockerSchema),
    }),
  ),
});

export type MonthList = z.infer<typeof monthListSchema>;

export const monthDetailSchema = z.object({
  asOf: isoDateSchema,
  month: monthKeySchema,
  status: z.enum(monthStatuses),
  blockers: z.array(blockerSchema),
  story: monthStorySchema,
});

export type MonthDetail = z.infer<typeof monthDetailSchema>;

export type StoryLine = {
  month: string;
  amount: number;
  categoryId: string | null;
  kind: "income" | "expense" | null;
  transfer: boolean;
};

export type StoryMerchant = {
  merchantId: string;
  firstMonth: string;
};

export type StoryOccurrence = {
  planId: string;
  dueDate: string;
  expectedAmount: number;
  actualAmount: number | null;
  skipped: boolean;
  amountMode: "fixed" | "variable";
  tolerance: number;
};

export type StoryBucketBalance = {
  bucketId: string;
  balance: number;
};

export type MonthStoryInput = {
  month: string;
  asOf: string;
  lines: readonly StoryLine[];
  merchants: readonly StoryMerchant[];
  occurrences: readonly StoryOccurrence[];
  buckets: readonly StoryBucketBalance[];
};

function divRoundHalfAway(numerator: bigint, denominator: bigint): number {
  const negative = numerator < 0n !== denominator < 0n;
  const left = numerator < 0n ? -numerator : numerator;
  const right = denominator < 0n ? -denominator : denominator;
  let quotient = left / right;
  const remainder = left % right;
  if (remainder * 2n >= right) {
    quotient += 1n;
  }
  return Number(negative ? -quotient : quotient);
}

function savingsRateMilliPct(income: number, spending: number): number | null {
  if (income === 0) {
    return null;
  }
  return divRoundHalfAway(BigInt(income - spending) * 100_000n, BigInt(income));
}

export function storyLineKind(value: string | null): StoryLine["kind"] {
  if (value === "income" || value === "expense") {
    return value;
  }
  return null;
}

export function isExpenseLine(line: Pick<StoryLine, "transfer" | "kind" | "categoryId">): boolean {
  return !line.transfer && line.kind === "expense" && line.categoryId !== null;
}

export function isIncomeLine(line: Pick<StoryLine, "transfer" | "kind" | "categoryId">): boolean {
  return !line.transfer && line.kind === "income" && line.categoryId !== null;
}

export function isUncategorizedLine(line: Pick<StoryLine, "transfer" | "categoryId">): boolean {
  return !line.transfer && line.categoryId === null;
}

export function expenseSpending(amount: number): number {
  return -amount;
}

export function uncategorizedFlows(amounts: readonly number[]): { spent: number; inflow: number } {
  let spent = 0;
  let inflow = 0;
  for (const amount of amounts) {
    if (amount < 0) {
      spent -= amount;
    } else if (amount > 0) {
      inflow += amount;
    }
  }
  return { spent, inflow };
}

function expenseByMonth(lines: readonly StoryLine[]): Map<string, Map<string, number>> {
  const months = new Map<string, Map<string, number>>();
  for (const line of lines) {
    if (!isExpenseLine(line) || line.categoryId === null) {
      continue;
    }
    let categories = months.get(line.month);
    if (!categories) {
      categories = new Map();
      months.set(line.month, categories);
    }
    categories.set(line.categoryId, (categories.get(line.categoryId) ?? 0) + expenseSpending(line.amount));
  }
  return months;
}

function uncategorizedOf(lines: readonly StoryLine[], month: string): { count: number; amount: number } {
  let count = 0;
  let amount = 0;
  for (const line of lines) {
    if (line.month !== month || !isUncategorizedLine(line)) {
      continue;
    }
    count += 1;
    amount += line.amount;
  }
  return { count, amount };
}

function incomeOf(lines: readonly StoryLine[], month: string): number {
  let total = 0;
  for (const line of lines) {
    if (line.month === month && isIncomeLine(line)) {
      total += line.amount;
    }
  }
  return total;
}

function spendingOf(byMonth: Map<string, Map<string, number>>, month: string): number {
  let total = 0;
  for (const amount of byMonth.get(month)?.values() ?? []) {
    total += amount;
  }
  return total;
}

function compareId(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

function categoryChanges(byMonth: Map<string, Map<string, number>>, month: string) {
  const earlier = priorMonths(month);
  const ids = new Set<string>();
  for (const key of [month, ...earlier]) {
    for (const id of byMonth.get(key)?.keys() ?? []) {
      ids.add(id);
    }
  }
  const changes = [...ids].map((categoryId) => {
    const amount = byMonth.get(month)?.get(categoryId) ?? 0;
    const median = medianMinor(earlier.map((key) => byMonth.get(key)?.get(categoryId) ?? 0));
    return { categoryId, amount, median, delta: amount - median };
  });
  const increases = changes
    .filter((row) => row.delta > 0)
    .sort((left, right) => right.delta - left.delta || compareId(left.categoryId, right.categoryId))
    .slice(0, 3);
  const decreases = changes
    .filter((row) => row.delta < 0)
    .sort((left, right) => left.delta - right.delta || compareId(left.categoryId, right.categoryId))
    .slice(0, 3);
  return { increases, decreases };
}

function planRows(occurrences: readonly StoryOccurrence[], month: string) {
  const planned = new Map<string, { planned: number; actual: number }>();
  const changes: MonthStory["recurringChanges"] = [];
  for (const item of occurrences) {
    if (item.skipped || !item.dueDate.startsWith(`${month}-`)) {
      continue;
    }
    const current = planned.get(item.planId) ?? { planned: 0, actual: 0 };
    current.planned += item.expectedAmount;
    current.actual += item.actualAmount ?? 0;
    planned.set(item.planId, current);
    if (
      item.amountMode === "fixed" &&
      item.actualAmount !== null &&
      !withinTolerance(item.actualAmount, item.expectedAmount, item.tolerance)
    ) {
      changes.push({
        planId: item.planId,
        dueDate: item.dueDate,
        expectedAmount: item.expectedAmount,
        actualAmount: item.actualAmount,
      });
    }
  }
  return {
    plan: [...planned.entries()]
      .map(([planId, row]) => ({ planId, planned: row.planned, actual: row.actual }))
      .sort((left, right) => compareId(left.planId, right.planId)),
    recurringChanges: changes.sort(
      (left, right) => compareId(left.dueDate, right.dueDate) || compareId(left.planId, right.planId),
    ),
  };
}

export function buildMonthStory(input: MonthStoryInput): MonthStory {
  const byMonth = expenseByMonth(input.lines);
  const income = incomeOf(input.lines, input.month);
  const spending = spendingOf(byMonth, input.month);
  const { increases, decreases } = categoryChanges(byMonth, input.month);
  const { plan, recurringChanges } = planRows(input.occurrences, input.month);
  return {
    month: input.month,
    asOf: input.asOf,
    income,
    spending,
    savings: income - spending,
    savingsRateMilliPct: savingsRateMilliPct(income, spending),
    uncategorized: uncategorizedOf(input.lines, input.month),
    increases,
    decreases,
    newMerchants: input.merchants
      .filter((row) => row.firstMonth === input.month)
      .map((row) => ({ merchantId: row.merchantId }))
      .sort((left, right) => compareId(left.merchantId, right.merchantId)),
    recurringChanges,
    buckets: [...input.buckets].sort((left, right) => compareId(left.bucketId, right.bucketId)),
    plan,
  };
}
