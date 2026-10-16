import { clampDay, daysBetween } from "./date";
import { Temporal } from "temporal-polyfill";
import { divideAmount } from "./currency";

export const amountModes = ["fixed", "variable"] as const;
export const planFrequencies = ["weekly", "monthly", "yearly"] as const;
export const businessDayShifts = ["none", "next", "previous"] as const;

export type AmountMode = (typeof amountModes)[number];
export type PlanFrequency = (typeof planFrequencies)[number];
export type BusinessDayShift = (typeof businessDayShifts)[number];

export type PlanSchedule = {
  startDate: string;
  endDate: string | null;
  freq: PlanFrequency;
  interval: number;
  monthDay: number | null;
  businessDayShift: BusinessDayShift;
};

export type OccurrenceDate = {
  nominalDate: string;
  dueDate: string;
};

function nominalOn(start: Temporal.PlainDate, plan: PlanSchedule, index: number) {
  const step = plan.interval * index;
  if (plan.freq === "weekly") {
    return start.add({ days: step * 7 });
  }
  const anchor = plan.monthDay ?? start.day;
  const moved =
    plan.freq === "monthly"
      ? start.with({ day: 1 }).add({ months: step })
      : start.with({ day: 1 }).add({ years: step });
  return clampDay(moved, anchor);
}

export function applyBusinessDayShift(iso: string, shift: BusinessDayShift): string {
  const date = Temporal.PlainDate.from(iso);
  if (shift === "none" || date.dayOfWeek <= 5) {
    return date.toString();
  }
  if (shift === "next") {
    return date.add({ days: date.dayOfWeek === 6 ? 2 : 1 }).toString();
  }
  return date.add({ days: date.dayOfWeek === 6 ? -1 : -2 }).toString();
}

export function occurrenceAt(plan: PlanSchedule, index: number): OccurrenceDate {
  const nominal = nominalOn(Temporal.PlainDate.from(plan.startDate), plan, index);
  return {
    nominalDate: nominal.toString(),
    dueDate: applyBusinessDayShift(nominal.toString(), plan.businessDayShift),
  };
}

function firstIndex(plan: PlanSchedule, from: Temporal.PlainDate) {
  const start = Temporal.PlainDate.from(plan.startDate);
  if (Temporal.PlainDate.compare(from, start) <= 0) {
    return 0;
  }
  if (plan.freq === "weekly") {
    const days = daysBetween(start, from);
    return Math.max(0, Math.floor(days / (7 * plan.interval)) - 1);
  }
  if (plan.freq === "monthly") {
    const months = (from.year - start.year) * 12 + (from.month - start.month);
    return Math.max(0, Math.floor(months / plan.interval) - 1);
  }
  return Math.max(0, Math.floor((from.year - start.year) / plan.interval) - 1);
}

/** The occurrences due from `from` to `to`, with the index of each one in the schedule. */
export function indexedOccurrences(plan: PlanSchedule, to: string, from?: string): (OccurrenceDate & { index: number })[] {
  const end = plan.endDate ? Temporal.PlainDate.from(plan.endDate) : null;
  const limit = Temporal.PlainDate.from(to);
  const earliest = from ? Temporal.PlainDate.from(from) : null;
  const stop = limit.add({ days: 2 });
  const dates: (OccurrenceDate & { index: number })[] = [];
  const startIndex = earliest ? firstIndex(plan, earliest) : 0;
  for (let index = startIndex; index < startIndex + 10000; index += 1) {
    const item = occurrenceAt(plan, index);
    const nominal = Temporal.PlainDate.from(item.nominalDate);
    if (end && Temporal.PlainDate.compare(nominal, end) > 0) {
      break;
    }
    if (Temporal.PlainDate.compare(nominal, stop) > 0) {
      break;
    }
    const due = Temporal.PlainDate.from(item.dueDate);
    if (Temporal.PlainDate.compare(due, limit) > 0) {
      continue;
    }
    if (earliest && Temporal.PlainDate.compare(due, earliest) < 0) {
      continue;
    }
    dates.push({ ...item, index });
  }
  return dates;
}

export function occurrenceDates(plan: PlanSchedule, to: string, from?: string): OccurrenceDate[] {
  return indexedOccurrences(plan, to, from).map(({ nominalDate, dueDate }) => ({ nominalDate, dueDate }));
}

export function linkWindowStart(startDate: string, asOf: string): string {
  const earliest = Temporal.PlainDate.from(asOf).subtract({ months: 13 }).toString();
  return startDate > earliest ? startDate : earliest;
}

export function withinTolerance(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

/** The median of amounts. The middle of two amounts is rounded to a whole number of minor units (`step`). */
export function medianAmount(values: readonly number[], step: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? 0;
  }
  return divideAmount((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0), 2, step);
}

export function variableAmounts(
  actualsNewestFirst: readonly number[],
  fallback: number,
  step: number,
): { forecast: number; safe: number } {
  if (actualsNewestFirst.length < 3) {
    return { forecast: fallback, safe: fallback };
  }
  const last = actualsNewestFirst.slice(0, 6);
  return { forecast: medianAmount(last, step), safe: Math.min(...last) };
}
