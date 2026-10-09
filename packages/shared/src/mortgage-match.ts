import { Temporal } from "temporal-polyfill";

export type ScheduledMortgagePayment = {
  date: string;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
};

export type MortgageActualPayment = {
  id: string;
  date: string;
  amount: number;
};

export type MortgageScheduleMatch = ScheduledMortgagePayment & {
  actual: MortgageActualPayment | null;
};

function dayDistance(left: string, right: string): number {
  return Math.abs(Temporal.PlainDate.from(left).until(Temporal.PlainDate.from(right), { largestUnit: "day" }).days);
}

/** Past scheduled payments take the nearest unused actual. Future rows stay empty. */
export function matchMortgageActuals(
  scheduled: readonly ScheduledMortgagePayment[],
  actuals: readonly MortgageActualPayment[],
  asOf: string,
): MortgageScheduleMatch[] {
  const past = scheduled.filter((row) => row.date <= asOf);
  const used = new Set<string>();
  return scheduled.map((row) => {
    if (row.date > asOf) {
      return { ...row, actual: null };
    }
    let best: MortgageActualPayment | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const actual of actuals) {
      if (used.has(actual.id) || actual.date > asOf) {
        continue;
      }
      const distance = dayDistance(row.date, actual.date);
      const closerToAnother = past.some(
        (other) => other.date !== row.date && dayDistance(other.date, actual.date) < distance,
      );
      if (closerToAnother) {
        continue;
      }
      const tiedEarlier = past.some(
        (other) => other.date < row.date && dayDistance(other.date, actual.date) === distance,
      );
      if (tiedEarlier) {
        continue;
      }
      if (distance < bestDistance || (distance === bestDistance && best !== null && actual.date < best.date)) {
        best = actual;
        bestDistance = distance;
      }
    }
    if (best) {
      used.add(best.id);
    }
    return { ...row, actual: best };
  });
}
