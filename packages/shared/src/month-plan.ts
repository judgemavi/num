import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { bucketColors, bucketKinds, type BucketColor, type BucketKind } from "./bucket";
import { divideAmount } from "./currency";
import { isoDateSchema } from "./date";
import { monthlyAmount } from "./funding";
import { occurrenceDates, variableAmounts, type AmountMode, type PlanKind, type PlanSchedule } from "./recurring-calc";
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

export type MonthPlanSource = {
  id: string;
  name: string;
  kind: PlanKind;
  amountMode: AmountMode;
  expectedAmount: number;
  fundsBuckets: boolean;
  active: boolean;
  archived: boolean;
  schedule: PlanSchedule;
};

export type MonthPlanLink = {
  planId: string;
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
  /** The balance at the start of the first month that the plan shows. It does not include the funding of that month. */
  balance: number;
  refillTo: number | null;
  amount: number | null;
  dueDate: string | null;
  repeat: "none" | "yearly" | null;
  target: number | null;
  targetDate: string | null;
  fixedAmount: number | null;
  /** The months to fill an emergency bucket from 0. `target` is the calculated target for this kind (decision 0060). */
  fillMonths: number | null;
  startDate: string;
  actualFunded: number;
};

const billItemSchema = z.object({
  planId: z.uuid(),
  name: z.string(),
  dueDate: isoDateSchema,
  planned: nonNegative,
  actual: nonNegative.nullable(),
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
  bills: z.object({ planned: nonNegative, actual: nonNegative, items: z.array(billItemSchema) }),
  funding: z.object({ planned: nonNegative, actual: nonNegative, items: z.array(fundingItemSchema) }),
  leftToSave: z.object({ planned: money, actual: money }),
  feasibility: z
    .object({
      income: nonNegative,
      bills: nonNegative,
      refills: nonNegative,
      emergency: nonNegative,
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
    .filter((link) => link.planId === plan.id && link.actual !== null && link.dueDate <= asOf)
    .sort((left, right) => (left.dueDate < right.dueDate ? 1 : left.dueDate > right.dueDate ? -1 : 0))
    .flatMap((link) => (link.actual === null ? [] : [link.actual]));
  const both = variableAmounts(actuals, plan.expectedAmount, step);
  return which === "forecast" ? both.forecast : both.safe;
}

function openPlans(plans: readonly MonthPlanSource[]) {
  return plans.filter((plan) => plan.active && !plan.archived && plan.kind !== "transfer");
}

function skippedKey(planId: string, dueDate: string) {
  return `${planId}|${dueDate}`;
}

function nextMonth(month: string) {
  return Temporal.PlainDate.from(`${month}-01`).add({ months: 1 }).toString().slice(0, 7);
}

function openingsFor(input: {
  month: string;
  asOf: string;
  plans: readonly MonthPlanSource[];
  links: readonly MonthPlanLink[];
  buckets: readonly MonthPlanBucketSource[];
  step: number;
}) {
  const origin = input.asOf.slice(0, 7);
  if (input.month <= origin) {
    return [...input.buckets];
  }
  let buckets = input.buckets.map((bucket) => ({ ...bucket, actualFunded: 0 }));
  let cursor = origin;
  while (cursor < input.month) {
    const funded = new Map(monthFigures({ ...input, month: cursor, buckets }).funding.items.map((item) => [item.bucketId, item.planned]));
    buckets = buckets.map((bucket) => ({ ...bucket, balance: bucket.balance + (funded.get(bucket.id) ?? 0) }));
    cursor = nextMonth(cursor);
  }
  const actuals = new Map(input.buckets.map((bucket) => [bucket.id, bucket.actualFunded]));
  return buckets.map((bucket) => ({ ...bucket, actualFunded: actuals.get(bucket.id) ?? 0 }));
}

export function buildMonthPlan(input: {
  month: string;
  asOf: string;
  plans: readonly MonthPlanSource[];
  links: readonly MonthPlanLink[];
  buckets: readonly MonthPlanBucketSource[];
  /** The milliunits in one minor unit of the book currency. */
  step: number;
}): MonthPlan {
  return monthFigures({ ...input, buckets: openingsFor(input) });
}

function monthFigures(input: {
  month: string;
  asOf: string;
  plans: readonly MonthPlanSource[];
  links: readonly MonthPlanLink[];
  buckets: readonly MonthPlanBucketSource[];
  step: number;
}) {
  const { start, end } = monthRange(input.month);
  const yearEnd = Temporal.PlainDate.from(start).add({ months: 12 }).subtract({ days: 1 }).toString();
  const skipped = new Set(input.links.filter((link) => link.skipped).map((link) => skippedKey(link.planId, link.dueDate)));
  const linked = new Map<string, number | null>();
  for (const link of input.links) {
    if (!link.skipped) {
      linked.set(skippedKey(link.planId, link.dueDate), link.actual);
    }
  }
  const bills: MonthPlan["bills"]["items"] = [];
  let incomePlanned = 0;
  let incomeActual = 0;
  let incomeYear = 0;
  let hasIncome = false;
  let billPlanned = 0;
  let billActual = 0;
  let safeBills = 0;

  for (const plan of openPlans(input.plans)) {
    if (plan.kind === "income") {
      incomeYear += Math.abs(amountOf(plan, input.links, input.asOf, "safe", input.step)) * occurrenceDates(plan.schedule, yearEnd, start).length;
      hasIncome = true;
    }
    const forecast = Math.abs(amountOf(plan, input.links, input.asOf, "forecast", input.step));
    const safe = Math.abs(amountOf(plan, input.links, input.asOf, "safe", input.step));
    for (const date of occurrenceDates(plan.schedule, end, start)) {
      if (skipped.has(skippedKey(plan.id, date.dueDate))) {
        continue;
      }
      const actual = linked.get(skippedKey(plan.id, date.dueDate));
      const paid = actual === undefined || actual === null ? null : Math.abs(actual);
      if (plan.kind === "income") {
        incomePlanned += forecast;
        incomeActual += paid ?? 0;
      } else if (plan.kind === "bill") {
        billPlanned += forecast;
        billActual += paid ?? 0;
        safeBills += safe;
        bills.push({ planId: plan.id, name: plan.name, dueDate: date.dueDate, planned: forecast, actual: paid });
      }
    }
  }

  const fundingItems: MonthPlan["funding"]["items"] = [];
  const need: { bucket: MonthPlanBucketSource; monthly: number }[] = [];
  let fundingPlanned = 0;
  let fundingActual = 0;
  let refills = 0;
  let emergency = 0;

  const activeBuckets = input.buckets.filter((bucket) => !bucket.archived).sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
  });

  for (const bucket of activeBuckets) {
    const monthly = input.month >= bucket.startDate.slice(0, 7) ? monthlyAmount(bucket, bucket.balance, input.month, input.step) : 0;
    const actual = Math.max(0, bucket.actualFunded);
    fundingActual += actual;
    if (monthly > 0 || actual > 0) {
      fundingItems.push({ bucketId: bucket.id, name: bucket.name, kind: bucket.kind, color: bucket.color, planned: monthly, actual });
      fundingPlanned += monthly;
    }
    if (bucket.kind === "spending") {
      refills += monthly;
    } else if (bucket.kind === "emergency") {
      emergency += monthly;
    } else if (monthly > 0) {
      need.push({ bucket, monthly });
    }
  }

  fundingItems.sort((left, right) => right.planned - left.planned || (left.name < right.name ? -1 : 1));
  bills.sort((left, right) => (left.dueDate < right.dueDate ? -1 : left.dueDate > right.dueDate ? 1 : left.name < right.name ? -1 : 1));

  let feasibility: MonthPlan["feasibility"] = null;
  if (hasIncome) {
    const incomeSafe = divideAmount(incomeYear, 12, input.step);
    const surplus = incomeSafe - safeBills - refills - emergency;
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
    feasibility = { income: incomeSafe, bills: safeBills, refills, emergency, surplus, need: total, shortfall: Math.max(0, total - surplus), buckets };
  }

  return {
    month: input.month,
    compareActual: input.asOf.slice(0, 7) === input.month,
    income: { planned: incomePlanned, actual: incomeActual },
    bills: { planned: billPlanned, actual: billActual, items: bills },
    funding: { planned: fundingPlanned, actual: fundingActual, items: fundingItems },
    leftToSave: {
      planned: incomePlanned - billPlanned - fundingPlanned,
      actual: incomeActual - billActual - fundingActual,
    },
    feasibility,
  };
}

function goalDateOf(bucket: MonthPlanBucketSource) {
  return bucket.kind === "sinking" ? bucket.dueDate : bucket.targetDate;
}
