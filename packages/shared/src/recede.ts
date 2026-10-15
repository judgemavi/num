import { roundToStep } from "./currency";
import type { ForecastFlow } from "./forecast";

export type RecedeAheadInput = {
  asOf: string;
  /** The forecast dates. Only the dates after `asOf` count. */
  dates: readonly string[];
  unassigned: number;
  flows: readonly ForecastFlow[];
  /** The balance of each bucket on `asOf`. */
  balances: ReadonlyMap<string, number>;
  /** The balance of the emergency bucket on `asOf`. */
  reserve: number;
  step: number;
};

/**
 * The first date after `asOf` when the projected pool is less than 0, the amount that the
 * emergency fund would give and the part that it cannot cover. On each date `d`:
 * pool = Unassigned + income(asOf, d] − Σ max(0, outflow_b(asOf, d] − balance_b) − other outflow(asOf, d].
 * Spending of a bucket that its balance holds does not lower the pool. A negative balance is already in Unassigned,
 * thus it holds 0.
 */
export function recedeAhead(input: RecedeAheadInput): { date: string | null; amount: number; uncovered: number } {
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
  if (short <= 0) {
    return { date: null, amount: 0, uncovered: 0 };
  }
  const amount = Math.min(short, roundToStep(Math.max(0, input.reserve), input.step));
  return { date: first, amount, uncovered: short - amount };
}
