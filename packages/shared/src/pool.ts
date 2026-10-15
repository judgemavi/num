import { Temporal } from "temporal-polyfill";
import { comparePriority, isSavings, type BucketKind } from "./bucket";
import { floorToStep, roundToStep } from "./currency";
import type { ForecastFlow } from "./forecast";
import { addDays } from "./funding";
import { monthLastDay } from "./month";
import { occurrenceDates, type PlanSchedule } from "./recurring-calc";

/** The fields of a bucket that set its place in the fill order. */
type Ranked = { id: string; kind: BucketKind; priority: number };

type ProjectedPoolInput = {
  asOf: string;
  /** The forecast dates. Only the dates after `asOf` count. */
  dates: readonly string[];
  unassigned: number;
  flows: readonly ForecastFlow[];
  /** The balance of each bucket on `asOf`. */
  balances: ReadonlyMap<string, number>;
  step: number;
};

/**
 * The first date after `asOf` when the projected pool is less than 0, and the short amount: the lowest pool as a
 * positive amount. On each date `d`:
 * pool = Unassigned + income(asOf, d] − Σ max(0, outflow_b(asOf, d] − balance_b) − other outflow(asOf, d].
 * Spending of a bucket that its balance holds does not lower the pool. A negative balance is already in Unassigned,
 * thus it holds 0.
 */
export function projectedPoolShort(input: ProjectedPoolInput): { date: string | null; short: number } {
  const byDate = new Map<string, ForecastFlow[]>();
  for (const flow of input.flows) {
    if (flow.date > input.asOf) {
      byDate.set(flow.date, [...(byDate.get(flow.date) ?? []), flow]);
    }
  }
  const outflow = new Map<string, number>();
  const overOf = (bucketId: string) => Math.max(0, (outflow.get(bucketId) ?? 0) - Math.max(0, input.balances.get(bucketId) ?? 0));
  let pool = input.unassigned;
  let first: string | null = null;
  let lowest = 0;
  for (const date of input.dates) {
    if (date <= input.asOf) {
      continue;
    }
    for (const flow of byDate.get(date) ?? []) {
      pool += flow.income;
      if (flow.bucketId === null) {
        pool -= flow.spending;
        continue;
      }
      const before = overOf(flow.bucketId);
      outflow.set(flow.bucketId, (outflow.get(flow.bucketId) ?? 0) + flow.spending);
      pool -= overOf(flow.bucketId) - before;
    }
    if (pool < 0 && first === null) {
      first = date;
    }
    lowest = Math.min(lowest, pool);
  }
  const short = roundToStep(-lowest, input.step);
  return short <= 0 ? { date: null, short: 0 } : { date: first, short };
}

/** The lowest priority first: the reverse of the fill order. */
function lowestFirst<T extends Ranked>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => comparePriority(right, left));
}

/**
 * The buckets that give money back when the pool is short, in the order that they give: the
 * savings buckets with `canRecede`, the lowest priority first. A paused bucket can recede.
 */
export function recedeOrder<T extends Ranked & { canRecede: boolean | null }>(buckets: readonly T[]): T[] {
  return lowestFirst(buckets.filter((bucket) => isSavings(bucket.kind) && bucket.canRecede === true));
}

/**
 * What each bucket in `order` gives for `short`, from its balance, down to 0, until `short` is met. Each amount is
 * rounded down to the step. `uncovered` is the part that no bucket gives.
 */
export function recedePlan(
  order: readonly { id: string; balance: number }[],
  short: number,
  step: number,
): { items: { bucketId: string; amount: number }[]; uncovered: number } {
  const items: { bucketId: string; amount: number }[] = [];
  let left = short;
  for (const bucket of order) {
    if (left <= 0) {
      break;
    }
    const amount = Math.min(left, floorToStep(Math.max(0, bucket.balance), step));
    if (amount > 0) {
      items.push({ bucketId: bucket.id, amount });
      left -= amount;
    }
  }
  return { items, uncovered: Math.max(0, left) };
}

type PauseCandidate = Ranked & { essential: boolean | null; paused: boolean; monthly: number };

/** The set of a bucket in the pause suggestion, or null when the app does not suggest it. */
function pauseSet(bucket: PauseCandidate): number | null {
  if (bucket.paused || bucket.monthly <= 0) {
    return null;
  }
  if (bucket.kind === "spending") {
    return bucket.essential ? null : 0;
  }
  if (bucket.kind === "goal" || bucket.kind === "sinking") {
    return 1;
  }
  if (bucket.kind === "commitment") {
    return bucket.essential ? null : 2;
  }
  return null;
}

/**
 * The buckets to pause for `short`: the non-essential spending buckets, then the goal and sinking buckets, then the
 * non-essential commitments, the lowest priority first in each set. It stops when the monthly amounts are `short` or more.
 */
export function pausePlan<T extends PauseCandidate>(buckets: readonly T[], short: number): { bucketId: string; monthly: number }[] {
  const ranked = lowestFirst(buckets.filter((bucket) => pauseSet(bucket) !== null));
  const sets = [0, 1, 2].flatMap((set) => ranked.filter((bucket) => pauseSet(bucket) === set));
  const items: { bucketId: string; monthly: number }[] = [];
  let total = 0;
  for (const bucket of sets) {
    if (total >= short) {
      break;
    }
    items.push({ bucketId: bucket.id, monthly: bucket.monthly });
    total += bucket.monthly;
  }
  return items;
}

/** The days after `asOf` in which a bill that does not hold its next payment is short. */
const billShortDays = 30;

type BillNeedInput = {
  schedule: PlanSchedule;
  /** The safe amount of one occurrence, as a positive number. */
  amount: number;
  /** The start date of the bucket. */
  startDate: string;
  /** The due dates of the occurrences that are skipped or linked. */
  closed: ReadonlySet<string>;
  balance: number;
  asOf: string;
};

/** The units of the horizon: four intervals. Each skipped or linked occurrence moves the next one by one interval. */
function horizonOf(schedule: PlanSchedule, from: string) {
  const count = schedule.interval * 4;
  const start = Temporal.PlainDate.from(from);
  const end = schedule.freq === "weekly" ? start.add({ weeks: count }) : schedule.freq === "monthly" ? start.add({ months: count }) : start.add({ years: count });
  return end.toString();
}

/**
 * The next payment of a bill: the next occurrence on or after `asOf` that is not skipped
 * and not linked. The amount is the sum of these occurrences in the month of that occurrence. The bill is short when
 * that occurrence is due in the next 30 days and the balance is less than the amount. Null when the bill has no next
 * occurrence.
 */
export function billNeed(input: BillNeedInput): { dueDate: string; amount: number; short: number } | null {
  const from = input.startDate > input.asOf ? input.startDate : input.asOf;
  const openUntil = (until: string) =>
    occurrenceDates(input.schedule, until, from).filter((item) => item.dueDate >= from && item.dueDate <= until && !input.closed.has(item.dueDate));
  const next = openUntil(horizonOf(input.schedule, from))[0];
  if (!next) {
    return null;
  }
  const month = next.dueDate.slice(0, 7);
  const amount = openUntil(monthLastDay(month)).filter((item) => item.dueDate.slice(0, 7) === month).length * input.amount;
  const soon = next.dueDate <= addDays(input.asOf, billShortDays);
  return { dueDate: next.dueDate, amount, short: soon ? Math.max(0, amount - Math.max(0, input.balance)) : 0 };
}
