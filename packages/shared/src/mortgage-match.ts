import { dayDistance } from "./date";

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

export type MortgageScheduleMatch = {
  date: string;
  scheduled: ScheduledMortgagePayment | null;
  actual: MortgageActualPayment | null;
};

/** Past scheduled payments take the nearest unused actual. An actual that matches none is its own row. */
export function matchMortgageActuals(
  scheduled: readonly ScheduledMortgagePayment[],
  actuals: readonly MortgageActualPayment[],
  asOf: string,
): MortgageScheduleMatch[] {
  const past = scheduled.filter((row) => row.date <= asOf);
  const used = new Set<string>();
  const rows: MortgageScheduleMatch[] = scheduled.map((row) => {
    if (row.date > asOf) {
      return { date: row.date, scheduled: row, actual: null };
    }
    let best: MortgageActualPayment | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const actual of actuals) {
      if (used.has(actual.id) || actual.date > asOf) {
        continue;
      }
      const distance = dayDistance(row.date, actual.date);
      const closerToAnother = past.some((other) => other.date !== row.date && dayDistance(other.date, actual.date) < distance);
      if (closerToAnother) {
        continue;
      }
      const tiedEarlier = past.some((other) => other.date < row.date && dayDistance(other.date, actual.date) === distance);
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
    return { date: row.date, scheduled: row, actual: best };
  });
  for (const actual of actuals) {
    if (used.has(actual.id) || actual.date > asOf) {
      continue;
    }
    rows.push({ date: actual.date, scheduled: null, actual });
  }
  rows.sort((left, right) => {
    if (left.date !== right.date) {
      return left.date < right.date ? -1 : 1;
    }
    if (left.scheduled !== null && right.scheduled === null) {
      return -1;
    }
    if (left.scheduled === null && right.scheduled !== null) {
      return 1;
    }
    return (left.actual?.id ?? "").localeCompare(right.actual?.id ?? "");
  });
  return rows;
}

function yearOf(date: string) {
  return Number(date.slice(0, 4));
}

/** The first and the last calendar year with a row. Null when there is no row. The rows are in date order. */
export function mortgageScheduleYears(rows: readonly MortgageScheduleMatch[]) {
  const first = rows.at(0);
  const last = rows.at(-1);
  return first && last ? { first: yearOf(first.date), last: yearOf(last.date) } : null;
}

/** The rows of one calendar year. */
export function mortgageRowsOfYear(rows: readonly MortgageScheduleMatch[], year: number) {
  return rows.filter((row) => yearOf(row.date) === year);
}

/** The year when it is in the range. Else the nearest year of the range. */
export function clampMortgageYear(year: number, years: { first: number; last: number }) {
  return Math.min(Math.max(year, years.first), years.last);
}
