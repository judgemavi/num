import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { bucketColors, bucketKinds, type BucketColor, type BucketKind } from "./bucket";
import { isoDateSchema } from "./date";
import { roundUpShare } from "./funding";
import { occurrenceDates, variableAmounts, type AmountMode, type PlanKind, type PlanSchedule } from "./recurring-calc";
import { centsSchema as cents } from "./money";

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
  balance: number;
  refillTo: number | null;
  amount: number | null;
  dueDate: string | null;
  target: number | null;
  targetDate: string | null;
  fixedAmount: number | null;
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
  perPaycheck: nonNegative,
  paychecks: nonNegative,
  planned: nonNegative,
  actual: nonNegative,
});

const feasibilityBucketSchema = z.object({
  bucketId: z.uuid(),
  name: z.string(),
  kind: z.enum(["sinking", "goal"] as const),
  perPaycheck: nonNegative,
  dueDate: isoDateSchema.nullable(),
  laterDate: isoDateSchema.nullable(),
});

export const monthPlanSchema = z.object({
  month: yearMonthSchema,
  compareActual: z.boolean(),
  paycheckCount: nonNegative,
  income: z.object({ planned: nonNegative, actual: nonNegative }),
  bills: z.object({ planned: nonNegative, actual: nonNegative, items: z.array(billItemSchema) }),
  funding: z.object({ planned: nonNegative, actual: nonNegative, items: z.array(fundingItemSchema) }),
  leftToSave: z.object({ planned: cents, actual: cents }),
  feasibility: z
    .object({
      expectedPaycheck: nonNegative,
      billsEach: nonNegative,
      refillsEach: nonNegative,
      surplus: cents,
      need: nonNegative,
      shortfall: nonNegative,
      buckets: z.array(feasibilityBucketSchema),
    })
    .nullable(),
});

export type MonthPlan = z.infer<typeof monthPlanSchema>;

type Hit = { date: string; safe: number };

function monthRange(month: string) {
  const start = Temporal.PlainDate.from(`${month}-01`);
  return { start: start.toString(), end: start.with({ day: start.daysInMonth }).toString() };
}

function inMonth(date: string, month: string) {
  return date.slice(0, 7) === month;
}

function shareUp(total: number, count: number) {
  if (count <= 0 || total <= 0) {
    return 0;
  }
  return Math.ceil(total / count);
}

function amountOf(plan: MonthPlanSource, links: readonly MonthPlanLink[], asOf: string, which: "forecast" | "safe") {
  if (plan.amountMode !== "variable") {
    return plan.expectedAmount;
  }
  const actuals = links
    .filter((link) => link.planId === plan.id && link.actual !== null && link.dueDate <= asOf)
    .sort((left, right) => (left.dueDate < right.dueDate ? 1 : left.dueDate > right.dueDate ? -1 : 0))
    .flatMap((link) => (link.actual === null ? [] : [link.actual]));
  const both = variableAmounts(actuals, plan.expectedAmount);
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

function surplusShares(
  surplus: number,
  buckets: readonly { bucketId: string; perPaycheck: number; dueDate: string | null }[],
) {
  const blocked = buckets.filter((bucket) => bucket.dueDate !== null && surplus - (buckets.reduce((sum, item) => sum + item.perPaycheck, 0) - bucket.perPaycheck) <= 0);
  const shares = new Map<string, number>();
  if (surplus <= 0 || blocked.length === 0) {
    return shares;
  }
  const total = blocked.reduce((sum, bucket) => sum + bucket.perPaycheck, 0);
  let left = surplus;
  blocked.forEach((bucket, index) => {
    const share = index === blocked.length - 1 ? left : Math.floor((surplus * bucket.perPaycheck) / total);
    shares.set(bucket.bucketId, share);
    left -= share;
  });
  return shares;
}

export function buildMonthPlan(input: {
  month: string;
  asOf: string;
  plans: readonly MonthPlanSource[];
  links: readonly MonthPlanLink[];
  buckets: readonly MonthPlanBucketSource[];
}): MonthPlan {
  return monthFigures({ ...input, buckets: openingsFor(input) });
}

function monthFigures(input: {
  month: string;
  asOf: string;
  plans: readonly MonthPlanSource[];
  links: readonly MonthPlanLink[];
  buckets: readonly MonthPlanBucketSource[];
}) {
  const { start, end } = monthRange(input.month);
  const horizon = Temporal.PlainDate.from(start).add({ years: 20 }).toString();
  const skipped = new Set(input.links.filter((link) => link.skipped).map((link) => skippedKey(link.planId, link.dueDate)));
  const linked = new Map<string, number | null>();
  for (const link of input.links) {
    if (!link.skipped) {
      linked.set(skippedKey(link.planId, link.dueDate), link.actual);
    }
  }
  const plans = openPlans(input.plans);
  const bills: MonthPlan["bills"]["items"] = [];
  let incomePlanned = 0;
  let incomeActual = 0;
  let billPlanned = 0;
  let billActual = 0;
  let safeBills = 0;
  const hits: Hit[] = [];

  for (const plan of plans) {
    const forecast = Math.abs(amountOf(plan, input.links, input.asOf, "forecast"));
    const safe = Math.abs(amountOf(plan, input.links, input.asOf, "safe"));
    for (const date of occurrenceDates(plan.schedule, plan.fundsBuckets ? horizon : end, start)) {
      if (skipped.has(skippedKey(plan.id, date.dueDate))) {
        continue;
      }
      if (plan.kind === "income" && plan.fundsBuckets) {
        hits.push({ date: date.dueDate, safe });
      }
      if (!inMonth(date.dueDate, input.month)) {
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

  hits.sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0));
  const inMonthHits = hits.filter((hit) => inMonth(hit.date, input.month));
  const paycheckCount = inMonthHits.length;
  const anchor = inMonthHits[0]?.date ?? start;
  const fromAnchor = hits.filter((hit) => hit.date >= anchor);

  const fundingItems: MonthPlan["funding"]["items"] = [];
  const feasibilityBuckets: NonNullable<MonthPlan["feasibility"]>["buckets"] = [];
  let fundingPlanned = 0;
  let fundingActual = 0;
  let refillTotal = 0;
  let need = 0;

  const activeBuckets = input.buckets.filter((bucket) => !bucket.archived).sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
  });

  for (const bucket of input.buckets) {
    if (!bucket.archived) {
      fundingActual += Math.max(0, bucket.actualFunded);
    }
  }

  for (const bucket of activeBuckets) {
    if (bucket.kind === "spending") {
      const planned = paycheckCount > 0 ? Math.max(0, (bucket.refillTo ?? 0) - bucket.balance) : 0;
      refillTotal += planned;
      if (planned > 0 || bucket.actualFunded > 0) {
        fundingItems.push({
          bucketId: bucket.id,
          name: bucket.name,
          kind: bucket.kind,
          color: bucket.color,
          perPaycheck: planned,
          paychecks: planned > 0 ? 1 : 0,
          planned,
          actual: Math.max(0, bucket.actualFunded),
        });
        fundingPlanned += planned;
      }
      continue;
    }

    const goalDate = bucket.kind === "sinking" ? bucket.dueDate : bucket.targetDate;
    const gap = Math.max(0, (bucket.kind === "sinking" ? (bucket.amount ?? 0) : (bucket.target ?? 0)) - bucket.balance);
    const fixed = bucket.kind === "goal" && bucket.targetDate === null;
    const remaining = fixed || goalDate === null ? 0 : fromAnchor.filter((hit) => hit.date < goalDate).length;
    const perPaycheck = fixed ? Math.max(0, bucket.fixedAmount ?? 0) : roundUpShare(gap, remaining);
    const times = fixed ? paycheckCount : fromAnchor.filter((hit) => inMonth(hit.date, input.month) && goalDate !== null && hit.date < goalDate).length;
    const once = !fixed && remaining === 0 && gap > 0;
    const planned = once ? perPaycheck : perPaycheck * times;
    if (planned > 0 || bucket.actualFunded > 0) {
      fundingItems.push({
        bucketId: bucket.id,
        name: bucket.name,
        kind: bucket.kind,
        color: bucket.color,
        perPaycheck,
        paychecks: once ? 1 : times,
        planned,
        actual: Math.max(0, bucket.actualFunded),
      });
      fundingPlanned += planned;
    }
    if (perPaycheck > 0) {
      need += perPaycheck;
      feasibilityBuckets.push({
        bucketId: bucket.id,
        name: bucket.name,
        kind: bucket.kind,
        perPaycheck,
        dueDate: goalDate,
        laterDate: null,
      });
    }
  }

  fundingItems.sort((left, right) => right.planned - left.planned || (left.name < right.name ? -1 : 1));
  bills.sort((left, right) => (left.dueDate < right.dueDate ? -1 : left.dueDate > right.dueDate ? 1 : left.name < right.name ? -1 : 1));

  let feasibility: MonthPlan["feasibility"] = null;
  if (paycheckCount > 0) {
    const expectedPaycheck = Math.min(...inMonthHits.map((hit) => hit.safe));
    const billsEach = shareUp(safeBills, paycheckCount);
    const refillsEach = shareUp(refillTotal, paycheckCount);
    const surplus = expectedPaycheck - billsEach - refillsEach;
    const shortfall = Math.max(0, need - surplus);
    const shares = surplusShares(surplus, feasibilityBuckets);
    const buckets = feasibilityBuckets.map((bucket) => {
      const alone = surplus - (need - bucket.perPaycheck);
      const room = alone > 0 ? alone : (shares.get(bucket.bucketId) ?? 0);
      const source = activeBuckets.find((item) => item.id === bucket.bucketId);
      const gap = source
        ? Math.max(0, (source.kind === "sinking" ? (source.amount ?? 0) : (source.target ?? 0)) - source.balance)
        : 0;
      const dated = bucket.dueDate !== null && room > 0 && bucket.perPaycheck > room && gap > 0;
      const later = dated ? dateAfter(fromAnchor, Math.ceil(gap / room)) : null;
      const laterDate = later !== null && bucket.dueDate !== null && later > bucket.dueDate ? later : null;
      return { ...bucket, laterDate };
    });
    feasibility = { expectedPaycheck, billsEach, refillsEach, surplus, need, shortfall, buckets };
  }

  return {
    month: input.month,
    compareActual: input.asOf.slice(0, 7) === input.month,
    paycheckCount,
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

function dateAfter(hits: readonly { date: string }[], count: number) {
  const hit = hits[count - 1];
  if (!hit) {
    return null;
  }
  return Temporal.PlainDate.from(hit.date).add({ days: 1 }).toString();
}
