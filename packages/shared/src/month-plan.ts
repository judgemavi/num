import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { bucketColors, bucketKinds, comparePriority, type BucketColor, type BucketKind } from "./bucket";
import { divideAmount } from "./currency";
import { isoDateSchema } from "./date";
import { monthlyAmount, type MonthlyCommitment } from "./funding";
import { occurrenceDates, variableAmounts, type AmountMode, type PlanSchedule } from "./recurring-calc";
import { amountSchema as money } from "./money";
import { firstOfMonthAfter, surplusShares } from "./month-plan-shares";

const nonNegative = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export function isYearMonth(value: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return false;
  }
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

export const yearMonthSchema = z.string().refine(isYearMonth);

export const planSearchSchema = z.object({
  month: yearMonthSchema.optional(),
});

export const monthPlanQuerySchema = z.object({
  asOf: isoDateSchema,
  month: yearMonthSchema.optional(),
});

/** The schedule of a commitment or an income bucket. `id` is the id of the bucket. */
export type MonthPlanSource = {
  id: string;
  name: string;
  kind: "commitment" | "income";
  amountMode: AmountMode;
  expectedAmount: number;
  archived: boolean;
  schedule: PlanSchedule;
};

export type MonthPlanLink = {
  bucketId: string;
  dueDate: string;
  skipped: boolean;
  actual: number | null;
};

export type MonthPlanBucketSource = {
  id: string;
  name: string;
  kind: BucketKind;
  priority: number;
  color: BucketColor;
  archived: boolean;
  /** A paused bucket has a monthly amount of 0. */
  paused: boolean;
  /** The balance at the start of the first month that the plan shows. It does not include the funding of that month. */
  balance: number;
  refillTo: number | null;
  amount: number | null;
  dueDate: string | null;
  repeat: "none" | "yearly" | null;
  target: number | null;
  targetDate: string | null;
  fixedAmount: number | null;
  startDate: string;
  actualFunded: number;
  /** The schedule data of a commitment for its monthly amount. Null for the other kinds. */
  commitment: MonthlyCommitment | null;
};

type PlanInput = {
  month: string;
  asOf: string;
  plans: readonly MonthPlanSource[];
  links: readonly MonthPlanLink[];
  buckets: readonly MonthPlanBucketSource[];
  /** The milliunits in one minor unit of the book currency. */
  step: number;
};

const commitmentItemSchema = z.object({
  bucketId: z.uuid(),
  name: z.string(),
  planned: nonNegative,
  actual: nonNegative,
});

const fundingItemSchema = z.object({
  bucketId: z.uuid(),
  name: z.string(),
  kind: z.enum(bucketKinds),
  color: z.enum(bucketColors),
  planned: nonNegative,
  actual: nonNegative,
});

const feasibilityBucketSchema = z.object({
  bucketId: z.uuid(),
  name: z.string(),
  kind: z.enum(["sinking", "goal"] as const),
  monthly: nonNegative,
  dueDate: isoDateSchema.nullable(),
  laterDate: isoDateSchema.nullable(),
});

export const monthPlanSchema = z.object({
  month: yearMonthSchema,
  compareActual: z.boolean(),
  income: z.object({ planned: nonNegative, actual: nonNegative }),
  commitments: z.object({ planned: nonNegative, actual: nonNegative, items: z.array(commitmentItemSchema) }),
  funding: z.object({ planned: nonNegative, actual: nonNegative, items: z.array(fundingItemSchema) }),
  leftToSave: z.object({ planned: money, actual: money }),
  feasibility: z
    .object({
      income: nonNegative,
      commitments: nonNegative,
      refills: nonNegative,
      surplus: money,
      need: nonNegative,
      shortfall: nonNegative,
      buckets: z.array(feasibilityBucketSchema),
    })
    .nullable(),
});

export type MonthPlan = z.infer<typeof monthPlanSchema>;

function monthRange(month: string) {
  const start = Temporal.PlainDate.from(`${month}-01`);
  return { start: start.toString(), end: start.with({ day: start.daysInMonth }).toString() };
}

function amountOf(plan: MonthPlanSource, links: readonly MonthPlanLink[], asOf: string, which: "forecast" | "safe", step: number) {
  if (plan.amountMode !== "variable") {
    return plan.expectedAmount;
  }
  const actuals = links
    .filter((link) => link.bucketId === plan.id && link.actual !== null && link.dueDate <= asOf)
    .sort((left, right) => (left.dueDate < right.dueDate ? 1 : left.dueDate > right.dueDate ? -1 : 0))
    .flatMap((link) => (link.actual === null ? [] : [link.actual]));
  const both = variableAmounts(actuals, plan.expectedAmount, step);
  return which === "forecast" ? both.forecast : both.safe;
}

function openPlans(plans: readonly MonthPlanSource[]) {
  return plans.filter((plan) => !plan.archived);
}

function skippedKey(bucketId: string, dueDate: string) {
  return `${bucketId}|${dueDate}`;
}

function nextMonth(month: string) {
  return Temporal.PlainDate.from(`${month}-01`).add({ months: 1 }).toString().slice(0, 7);
}

function openingsFor(input: PlanInput) {
  const origin = input.asOf.slice(0, 7);
  if (input.month <= origin) {
    return [...input.buckets];
  }
  let buckets = input.buckets.map((bucket) => ({ ...bucket, actualFunded: 0 }));
  let cursor = origin;
  while (cursor < input.month) {
    const funded = new Map(monthFigures({ ...input, month: cursor, buckets }).funded.map((item) => [item.bucketId, item.planned]));
    buckets = buckets.map((bucket) => ({ ...bucket, balance: bucket.balance + (funded.get(bucket.id) ?? 0) }));
    cursor = nextMonth(cursor);
  }
  const actuals = new Map(input.buckets.map((bucket) => [bucket.id, bucket.actualFunded]));
  return buckets.map((bucket) => ({ ...bucket, actualFunded: actuals.get(bucket.id) ?? 0 }));
}

export function buildMonthPlan(input: PlanInput): MonthPlan {
  return monthFigures({ ...input, buckets: openingsFor(input) }).plan;
}

function monthFigures(input: PlanInput) {
  const { start, end } = monthRange(input.month);
  const yearEnd = Temporal.PlainDate.from(start).add({ months: 12 }).subtract({ days: 1 }).toString();
  const skipped = new Set(input.links.filter((link) => link.skipped).map((link) => skippedKey(link.bucketId, link.dueDate)));
  const linked = new Map<string, number | null>();
  for (const link of input.links) {
    if (!link.skipped) {
      linked.set(skippedKey(link.bucketId, link.dueDate), link.actual);
    }
  }
  let incomePlanned = 0;
  let incomeActual = 0;
  let incomeYear = 0;
  let hasIncome = false;
  let commitmentYear = 0;

  for (const plan of openPlans(input.plans)) {
    const forecast = Math.abs(amountOf(plan, input.links, input.asOf, "forecast", input.step));
    const safe = Math.abs(amountOf(plan, input.links, input.asOf, "safe", input.step));
    const yearCount = occurrenceDates(plan.schedule, yearEnd, start).length;
    if (plan.kind === "income") {
      incomeYear += safe * yearCount;
      hasIncome = true;
    } else {
      commitmentYear += safe * yearCount;
    }
    for (const date of occurrenceDates(plan.schedule, end, start)) {
      if (skipped.has(skippedKey(plan.id, date.dueDate))) {
        continue;
      }
      const actual = linked.get(skippedKey(plan.id, date.dueDate));
      const paid = actual === undefined || actual === null ? null : Math.abs(actual);
      if (plan.kind === "income") {
        incomePlanned += forecast;
        incomeActual += paid ?? 0;
      }
    }
  }

  const funded: MonthPlan["funding"]["items"] = [];
  const need: { bucket: MonthPlanBucketSource; monthly: number }[] = [];
  let refills = 0;

  const activeBuckets = input.buckets.filter((bucket) => !bucket.archived && bucket.kind !== "income").sort(comparePriority);

  for (const bucket of activeBuckets) {
    const monthly = input.month >= bucket.startDate.slice(0, 7) ? monthlyAmount(bucket, bucket.balance, input.month, input.step) : 0;
    const actual = Math.max(0, bucket.actualFunded);
    if (monthly > 0 || actual > 0) {
      funded.push({ bucketId: bucket.id, name: bucket.name, kind: bucket.kind, color: bucket.color, planned: monthly, actual });
    }
    if (bucket.kind === "spending") {
      refills += monthly;
    } else if ((bucket.kind === "sinking" || bucket.kind === "goal") && monthly > 0) {
      need.push({ bucket, monthly });
    }
  }

  // The commitments are their own section: the monthly amount of each commitment bucket.
  const byAmount = (left: { planned: number; name: string }, right: { planned: number; name: string }) =>
    right.planned - left.planned || (left.name < right.name ? -1 : 1);
  const fundingItems = funded.filter((item) => item.kind !== "commitment").sort(byAmount);
  const commitments = funded
    .filter((item) => item.kind === "commitment")
    .map(({ bucketId, name, planned, actual }) => ({ bucketId, name, planned, actual }))
    .sort(byAmount);
  const sum = (items: readonly { planned: number; actual: number }[], key: "planned" | "actual") => items.reduce((total, item) => total + item[key], 0);
  const fundingPlanned = sum(fundingItems, "planned");
  const fundingActual = sum(fundingItems, "actual");
  const commitmentPlanned = sum(commitments, "planned");
  const commitmentActual = sum(commitments, "actual");

  let feasibility: MonthPlan["feasibility"] = null;
  if (hasIncome) {
    const incomeSafe = divideAmount(incomeYear, 12, input.step);
    const commitmentSafe = divideAmount(commitmentYear, 12, input.step);
    const surplus = incomeSafe - commitmentSafe - refills;
    const total = need.reduce((sum, item) => sum + item.monthly, 0);
    const shares = surplusShares(surplus, need.map((item) => ({ bucketId: item.bucket.id, monthly: item.monthly, dueDate: goalDateOf(item.bucket) })), input.step);
    const buckets = need.map(({ bucket, monthly }): NonNullable<MonthPlan["feasibility"]>["buckets"][number] => {
      const alone = surplus - (total - monthly);
      const room = alone > 0 ? alone : (shares.get(bucket.id) ?? 0);
      const dueDate = goalDateOf(bucket);
      const gap = Math.max(0, (bucket.kind === "sinking" ? (bucket.amount ?? 0) : (bucket.target ?? 0)) - bucket.balance);
      const later = dueDate !== null && room > 0 && monthly > room && gap > 0 ? firstOfMonthAfter(input.month, Math.ceil(gap / room)) : null;
      return { bucketId: bucket.id, name: bucket.name, kind: bucket.kind === "sinking" ? "sinking" : "goal", monthly, dueDate, laterDate: later !== null && dueDate !== null && later > dueDate ? later : null };
    });
    feasibility = { income: incomeSafe, commitments: commitmentSafe, refills, surplus, need: total, shortfall: Math.max(0, total - surplus), buckets };
  }

  const plan: MonthPlan = {
    month: input.month,
    compareActual: input.asOf.slice(0, 7) === input.month,
    income: { planned: incomePlanned, actual: incomeActual },
    commitments: { planned: commitmentPlanned, actual: commitmentActual, items: commitments },
    funding: { planned: fundingPlanned, actual: fundingActual, items: fundingItems },
    leftToSave: {
      planned: incomePlanned - commitmentPlanned - fundingPlanned,
      actual: incomeActual - commitmentActual - fundingActual,
    },
    feasibility,
  };
  return { plan, funded };
}

function goalDateOf(bucket: MonthPlanBucketSource) {
  return bucket.kind === "sinking" ? bucket.dueDate : bucket.targetDate;
}
