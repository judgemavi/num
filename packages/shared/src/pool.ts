import { comparePriority, isSavings, type BucketKind } from "./bucket";
import { floorToStep, roundToStep } from "./currency";
import type { ForecastFlow } from "./forecast";
import { addDays } from "./funding";
import { monthLastDay } from "./month";
import type { PlanSchedule } from "./recurring-calc";
import { addPeriods, occurrenceWindows, windowEnded } from "./recurring-window";

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

/** The days after `asOf` in which a bill that does not hold its next payment has a gap. */
const billGapDays = 30;

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

/**
 * The next payment of a bill: the earliest occurrence from the start date of the bucket that is not skipped, not linked
 * and whose window has not ended on `asOf`. The amount is the sum of these occurrences in the month of that occurrence.
 * The gap is the amount − the balance (a negative balance counts as 0), minimum 0, when that occurrence is due in the
 * next 30 days. Otherwise 0. Null when the bill has no next occurrence. Each skipped or linked occurrence moves the
 * next one by one interval: the search looks four intervals ahead.
 */
export function billNeed(input: BillNeedInput): { dueDate: string; amount: number; gap: number } | null {
  const later = (left: string, right: string) => (left > right ? left : right);
  const from = later(input.startDate, addPeriods(input.schedule, input.asOf, -1));
  const open = (until: string) =>
    occurrenceWindows(input.schedule, until, from).filter((item) => item.dueDate >= input.startDate && !input.closed.has(item.dueDate) && !windowEnded(item, input.asOf));
  const next = open(addPeriods(input.schedule, later(input.startDate, input.asOf), 4))[0];
  if (!next) {
    return null;
  }
  const month = next.dueDate.slice(0, 7);
  const amount = open(monthLastDay(month)).filter((item) => item.dueDate.slice(0, 7) === month).length * input.amount;
  const soon = next.dueDate <= addDays(input.asOf, billGapDays);
  return { dueDate: next.dueDate, amount, gap: soon ? Math.max(0, amount - Math.max(0, input.balance)) : 0 };
}

/** A bucket in fill order. `bill` is set for a bill: its gap, the due date of its next payment and the pause. */
type CoverRow = { bucketId: string; bill: { gap: number; dueDate: string; paused: boolean } | null };

/**
 * The part of each bill gap that Unassigned (on `asOf`) covers, and the rest (short). The app gives Unassigned to the
 * gaps in fill order. Before each bill, each bucket that is not a bill and comes before it takes its owed amount of the
 * month of the bill's payment (`owed`). A paused bill gets no money: its whole gap is short.
 */
export function coverBills(input: {
  unassigned: number;
  order: readonly CoverRow[];
  owed: (bucketId: string, month: string) => number;
}): Map<string, { covered: number; short: number }> {
  const parts = new Map<string, { covered: number; short: number }>();
  let used = 0;
  input.order.forEach((row, index) => {
    const bill = row.bill;
    if (!bill) {
      return;
    }
    const month = bill.dueDate.slice(0, 7);
    const taken = input.order.slice(0, index).reduce((sum, other) => sum + (other.bill ? 0 : input.owed(other.bucketId, month)), 0);
    const free = bill.paused ? 0 : Math.max(0, input.unassigned - used - taken);
    const covered = Math.min(bill.gap, free);
    used += covered;
    parts.set(row.bucketId, { covered, short: bill.gap - covered });
  });
  return parts;
}

/** The date when the fill gives the covered part: the first day of the month of the payment, or `asOf` when that is later. */
export function billFillsOn(dueDate: string, asOf: string): string {
  const start = `${dueDate.slice(0, 7)}-01`;
  return start > asOf ? start : asOf;
}
