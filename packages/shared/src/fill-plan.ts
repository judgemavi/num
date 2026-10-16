import { Temporal } from "temporal-polyfill";
import { comparePriority, type BucketKind } from "./bucket";
import { divideAmount, floorToStep } from "./currency";
import { monthLastDay } from "./month";
import { occurrenceDates, type PlanSchedule } from "./recurring-calc";
import { occurrenceWindows, windowEnded } from "./recurring-window";

/** An active schedule and the due dates of its linked or skipped occurrences. */
export type FillSchedule = { schedule: PlanSchedule; startDate: string; closed: ReadonlySet<string> };

/** A bucket after negative balances have been covered. Amounts are in milliunits. */
export type FillBucket = {
  id: string;
  kind: BucketKind;
  priority: number;
  essential: boolean | null;
  paused: boolean;
  monthly: number;
  funded: number;
  owed: number;
  balance: number;
  commitment: (FillSchedule & { amount: number }) | null;
};

/** The next open income due after asOf, limited to the month of asOf. */
export function payHorizon(asOf: string, incomes: readonly FillSchedule[]): string {
  let horizon = monthLastDay(asOf.slice(0, 7));
  for (const income of incomes) {
    const from = income.startDate > asOf ? income.startDate : asOf;
    for (const item of occurrenceDates(income.schedule, horizon, from)) {
      if (item.dueDate > asOf && !income.closed.has(item.dueDate) && item.dueDate < horizon) {
        horizon = item.dueDate;
      }
    }
  }
  return horizon;
}

function billToHorizon(bucket: FillBucket, asOf: string, horizon: string): number {
  const bill = bucket.commitment;
  if (!bill) {
    return 0;
  }
  const first = `${asOf.slice(0, 7)}-01`;
  const from = bill.startDate > first ? bill.startDate : first;
  const due = occurrenceWindows(bill.schedule, horizon, from)
    .filter((item) => !bill.closed.has(item.dueDate) && !windowEnded(item, asOf));
  return Math.max(0, due.length * bill.amount - bucket.balance);
}

/** Bills to the horizon, essential spending to the horizon, then the rest. Each pass uses bucket priority order. */
export function fillPlan(input: {
  asOf: string;
  incomes: readonly FillSchedule[];
  buckets: readonly FillBucket[];
  unassigned: number;
  step: number;
}): { bucketId: string; amount: number }[] {
  const horizon = payHorizon(input.asOf, input.incomes);
  const date = Temporal.PlainDate.from(horizon);
  const order = [...input.buckets].filter((bucket) => !bucket.paused && bucket.owed > 0).sort(comparePriority);
  const paid = new Map<string, number>();
  let free = Math.max(0, floorToStep(input.unassigned, input.step));
  function pay(bucket: FillBucket, need: number) {
    const before = paid.get(bucket.id) ?? 0;
    const amount = Math.min(free, bucket.owed - before, Math.max(0, need));
    if (amount > 0) {
      paid.set(bucket.id, before + amount);
      free -= amount;
    }
  }
  for (const bucket of order) {
    if (bucket.kind === "commitment") {
      pay(bucket, billToHorizon(bucket, input.asOf, horizon));
    }
  }
  for (const bucket of order) {
    if (bucket.kind === "spending" && bucket.essential === true) {
      const share = divideAmount(bucket.monthly * date.day, date.daysInMonth, input.step, "up");
      pay(bucket, share - bucket.funded);
    }
  }
  for (const bucket of order) {
    pay(bucket, bucket.owed);
  }
  return [...paid].map(([bucketId, amount]) => ({ bucketId, amount }));
}
