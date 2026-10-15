import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { floorToStep, divideAmount } from "./currency";
import { isoDateSchema } from "./date";
import { monthlyAmount, type MonthlyBucket } from "./funding";
import { amountSchema as money } from "./money";
import { occurrenceDates, type PlanSchedule } from "./recurring-calc";

const nonNegative = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** An active commitment or income. `safe` is its safe amount (spec §5.7) as a positive number. */
export type FeasibilitySchedule = {
  kind: "commitment" | "income";
  safe: number;
  schedule: PlanSchedule;
};

/** An active bucket. `balance` is its balance on the day before the month starts. */
export type FeasibilityBucket = MonthlyBucket & {
  id: string;
  name: string;
  balance: number;
};

type FeasibilityInput = {
  /** YYYY-MM: the month of `asOf`. */
  month: string;
  schedules: readonly FeasibilitySchedule[];
  buckets: readonly FeasibilityBucket[];
  /** The milliunits in one minor unit of the book currency. */
  step: number;
};

const feasibilityBucketSchema = z.object({
  bucketId: z.uuid(),
  name: z.string(),
  kind: z.enum(["sinking", "goal"] as const),
  monthly: nonNegative,
  dueDate: isoDateSchema.nullable(),
  laterDate: isoDateSchema.nullable(),
});

/** Goal feasibility (spec §7.8). Null when the book has no active income. */
export const feasibilitySchema = z.object({
  asOf: isoDateSchema,
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

type Feasibility = NonNullable<z.infer<typeof feasibilitySchema>["feasibility"]>;

/** The share of the surplus for each dated goal that does not fit alone. */
function surplusShares(surplus: number, buckets: readonly { bucketId: string; monthly: number; dueDate: string | null }[], step: number) {
  const blocked = buckets.filter((bucket) => bucket.dueDate !== null && surplus - (buckets.reduce((sum, item) => sum + item.monthly, 0) - bucket.monthly) <= 0);
  const shares = new Map<string, number>();
  if (surplus <= 0 || blocked.length === 0) {
    return shares;
  }
  const total = blocked.reduce((sum, bucket) => sum + bucket.monthly, 0);
  let left = surplus;
  blocked.forEach((bucket, index) => {
    const share = index === blocked.length - 1 ? left : floorToStep((surplus * bucket.monthly) / total, step);
    shares.set(bucket.bucketId, share);
    left -= share;
  });
  return shares;
}

function goalDateOf(bucket: FeasibilityBucket) {
  return bucket.kind === "sinking" ? bucket.dueDate : bucket.targetDate;
}

/**
 * Goal feasibility for one month (spec §7.8). The income and the commitments are their yearly amount / 12 (safe amounts),
 * from the first day of the month. The surplus does not subtract an emergency amount.
 */
export function buildFeasibility(input: FeasibilityInput): Feasibility | null {
  const start = `${input.month}-01`;
  const yearEnd = Temporal.PlainDate.from(start).add({ months: 12 }).subtract({ days: 1 }).toString();
  const yearly = (kind: FeasibilitySchedule["kind"]) =>
    input.schedules.filter((item) => item.kind === kind).reduce((sum, item) => sum + item.safe * occurrenceDates(item.schedule, yearEnd, start).length, 0);
  if (!input.schedules.some((item) => item.kind === "income")) {
    return null;
  }
  let refills = 0;
  const need: { bucket: FeasibilityBucket; monthly: number }[] = [];
  for (const bucket of input.buckets) {
    const monthly = input.month >= bucket.startDate.slice(0, 7) ? monthlyAmount(bucket, bucket.balance, input.month, input.step) : 0;
    if (bucket.kind === "spending") {
      refills += monthly;
    } else if ((bucket.kind === "sinking" || bucket.kind === "goal") && monthly > 0) {
      need.push({ bucket, monthly });
    }
  }
  const income = divideAmount(yearly("income"), 12, input.step);
  const commitments = divideAmount(yearly("commitment"), 12, input.step);
  const surplus = income - commitments - refills;
  const total = need.reduce((sum, item) => sum + item.monthly, 0);
  const shares = surplusShares(surplus, need.map((item) => ({ bucketId: item.bucket.id, monthly: item.monthly, dueDate: goalDateOf(item.bucket) })), input.step);
  const buckets = need.map(({ bucket, monthly }) => {
    const alone = surplus - (total - monthly);
    const room = alone > 0 ? alone : (shares.get(bucket.id) ?? 0);
    const dueDate = goalDateOf(bucket);
    const gap = Math.max(0, (bucket.kind === "sinking" ? (bucket.amount ?? 0) : (bucket.target ?? 0)) - bucket.balance);
    const later = dueDate !== null && room > 0 && monthly > room && gap > 0 ? Temporal.PlainDate.from(start).add({ months: Math.ceil(gap / room) }).toString() : null;
    return {
      bucketId: bucket.id,
      name: bucket.name,
      kind: bucket.kind === "sinking" ? ("sinking" as const) : ("goal" as const),
      monthly,
      dueDate,
      laterDate: later !== null && dueDate !== null && later > dueDate ? later : null,
    };
  });
  return { income, commitments, refills, surplus, need: total, shortfall: Math.max(0, total - surplus), buckets };
}
