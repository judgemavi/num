import { Temporal } from "temporal-polyfill";

export const planKinds = ["income", "bill", "transfer"] as const;
export const amountModes = ["fixed", "variable"] as const;
export const planFrequencies = ["weekly", "monthly", "yearly"] as const;
export const businessDayShifts = ["none", "next", "previous"] as const;

export type PlanKind = (typeof planKinds)[number];
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

function clampDay(month: Temporal.PlainDate, monthDay: number): Temporal.PlainDate {
  if (monthDay === -1) {
    return month.with({ day: month.daysInMonth });
  }
  return month.with({ day: Math.min(monthDay, month.daysInMonth) });
}

function nominalOn(start: Temporal.PlainDate, plan: PlanSchedule, index: number): Temporal.PlainDate {
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

function firstIndex(plan: PlanSchedule, from: Temporal.PlainDate): number {
  const start = Temporal.PlainDate.from(plan.startDate);
  if (Temporal.PlainDate.compare(from, start) <= 0) {
    return 0;
  }
  if (plan.freq === "weekly") {
    const days = start.until(from, { largestUnit: "day" }).days;
    return Math.max(0, Math.floor(days / (7 * plan.interval)) - 1);
  }
  if (plan.freq === "monthly") {
    const months = (from.year - start.year) * 12 + (from.month - start.month);
    return Math.max(0, Math.floor(months / plan.interval) - 1);
  }
  return Math.max(0, Math.floor((from.year - start.year) / plan.interval) - 1);
}

export function occurrenceDates(plan: PlanSchedule, to: string, from?: string): OccurrenceDate[] {
  const end = plan.endDate ? Temporal.PlainDate.from(plan.endDate) : null;
  const limit = Temporal.PlainDate.from(to);
  const earliest = from ? Temporal.PlainDate.from(from) : null;
  const stop = limit.add({ days: 2 });
  const dates: OccurrenceDate[] = [];
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
    dates.push(item);
  }
  return dates;
}

export function linkWindowStart(startDate: string, asOf: string): string {
  const earliest = Temporal.PlainDate.from(asOf).subtract({ months: 13 }).toString();
  return startDate > earliest ? startDate : earliest;
}

export function dayDistance(left: string, right: string): number {
  const start = Temporal.PlainDate.from(left);
  const end = Temporal.PlainDate.from(right);
  return Math.abs(start.until(end, { largestUnit: "day" }).days);
}

export function isMissed(dueDate: string, asOf: string, graceDays: number): boolean {
  const due = Temporal.PlainDate.from(dueDate);
  const today = Temporal.PlainDate.from(asOf);
  return due.until(today, { largestUnit: "day" }).days > graceDays;
}

export function isInboxMissed(dueDate: string, asOf: string, graceDays: number): boolean {
  if (!isMissed(dueDate, asOf, graceDays)) {
    return false;
  }
  const start = Temporal.PlainDate.from(asOf).subtract({ days: 35 });
  return Temporal.PlainDate.compare(Temporal.PlainDate.from(dueDate), start) >= 0;
}

export function withinTolerance(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

export function divideHalfAway(sum: number, divisor: number): number {
  const negative = sum < 0;
  const magnitude = Math.abs(sum);
  const quotient = Math.floor(magnitude / divisor);
  const remainder = magnitude % divisor;
  const rounded = remainder * 2 >= divisor ? quotient + 1 : quotient;
  return negative ? -rounded : rounded;
}

export function medianMinor(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? 0;
  }
  return divideHalfAway((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0), 2);
}

export function variableAmounts(
  actualsNewestFirst: readonly number[],
  fallback: number,
): { forecast: number; safe: number } {
  if (actualsNewestFirst.length < 3) {
    return { forecast: fallback, safe: fallback };
  }
  const last = actualsNewestFirst.slice(0, 6);
  return { forecast: medianMinor(last), safe: Math.min(...last) };
}

export type OpenOccurrence = {
  planId: string;
  dueDate: string;
  accountId: string;
  merchantId: string | null;
  expectedAmount: number;
  tolerance: number;
};

export type LinkTransaction = {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  merchantId: string | null;
};

export type UniqueLink = {
  planId: string;
  dueDate: string;
  transactionId: string;
};

export type AmbiguousLink = {
  planId: string;
  dueDate: string;
  transactionIds: string[];
};

function occurrenceKey(planId: string, dueDate: string): string {
  return `${planId}|${dueDate}`;
}

export function isLinkCandidate(
  occurrence: OpenOccurrence,
  transaction: LinkTransaction,
  graceDays: number,
): boolean {
  if (transaction.accountId !== occurrence.accountId) {
    return false;
  }
  if (dayDistance(transaction.date, occurrence.dueDate) > graceDays) {
    return false;
  }
  if (occurrence.merchantId && transaction.merchantId !== occurrence.merchantId) {
    return false;
  }
  return withinTolerance(transaction.amount, occurrence.expectedAmount, occurrence.tolerance);
}

function lowerBound(rows: readonly LinkTransaction[], date: string): number {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((rows[mid]?.date ?? "") < date) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function upperBound(rows: readonly LinkTransaction[], date: string): number {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((rows[mid]?.date ?? "") <= date) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

export function matchLinks(
  occurrences: readonly OpenOccurrence[],
  transactions: readonly LinkTransaction[],
  graceDays: number,
): { unique: UniqueLink[]; ambiguous: AmbiguousLink[] } {
  const byAccount = new Map<string, LinkTransaction[]>();
  for (const transaction of transactions) {
    const rows = byAccount.get(transaction.accountId) ?? [];
    rows.push(transaction);
    byAccount.set(transaction.accountId, rows);
  }
  for (const rows of byAccount.values()) {
    rows.sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : left.id < right.id ? -1 : 1));
  }

  const byOccurrence = new Map<string, string[]>();
  const byTransaction = new Map<string, string[]>();
  for (const occurrence of occurrences) {
    const key = occurrenceKey(occurrence.planId, occurrence.dueDate);
    const rows = byAccount.get(occurrence.accountId) ?? [];
    const from = Temporal.PlainDate.from(occurrence.dueDate).subtract({ days: graceDays }).toString();
    const to = Temporal.PlainDate.from(occurrence.dueDate).add({ days: graceDays }).toString();
    const ids: string[] = [];
    for (let index = lowerBound(rows, from); index < upperBound(rows, to); index += 1) {
      const transaction = rows[index];
      if (!transaction || !isLinkCandidate(occurrence, transaction, graceDays)) {
        continue;
      }
      ids.push(transaction.id);
      const keys = byTransaction.get(transaction.id) ?? [];
      keys.push(key);
      byTransaction.set(transaction.id, keys);
    }
    byOccurrence.set(key, ids);
  }

  const unique: UniqueLink[] = [];
  const ambiguous: AmbiguousLink[] = [];
  for (const occurrence of occurrences) {
    const ids = byOccurrence.get(occurrenceKey(occurrence.planId, occurrence.dueDate)) ?? [];
    if (ids.length === 0) {
      continue;
    }
    const sole = ids.length === 1 ? ids[0] : undefined;
    if (sole && (byTransaction.get(sole)?.length ?? 0) === 1) {
      unique.push({ planId: occurrence.planId, dueDate: occurrence.dueDate, transactionId: sole });
      continue;
    }
    ambiguous.push({ planId: occurrence.planId, dueDate: occurrence.dueDate, transactionIds: ids });
  }
  return { unique, ambiguous };
}
