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

export function occurrenceDates(plan: PlanSchedule, to: string): OccurrenceDate[] {
  const end = plan.endDate ? Temporal.PlainDate.from(plan.endDate) : null;
  const limit = Temporal.PlainDate.from(to);
  const stop = limit.add({ days: 2 });
  const dates: OccurrenceDate[] = [];
  for (let index = 0; index < 10000; index += 1) {
    const item = occurrenceAt(plan, index);
    const nominal = Temporal.PlainDate.from(item.nominalDate);
    if (end && Temporal.PlainDate.compare(nominal, end) > 0) {
      break;
    }
    if (Temporal.PlainDate.compare(nominal, stop) > 0) {
      break;
    }
    if (Temporal.PlainDate.compare(Temporal.PlainDate.from(item.dueDate), limit) > 0) {
      continue;
    }
    dates.push(item);
  }
  return dates;
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

export function withinTolerance(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

function roundHalfAwayFromZero(sum: number, divisor: number): number {
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
  return roundHalfAwayFromZero((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0), 2);
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

export function matchLinks(
  occurrences: readonly OpenOccurrence[],
  transactions: readonly LinkTransaction[],
  graceDays: number,
): { unique: UniqueLink[]; ambiguous: AmbiguousLink[] } {
  const byOccurrence = new Map<string, string[]>();
  const byTransaction = new Map<string, string[]>();
  for (const occurrence of occurrences) {
    const key = occurrenceKey(occurrence.planId, occurrence.dueDate);
    const ids: string[] = [];
    for (const transaction of transactions) {
      if (!isLinkCandidate(occurrence, transaction, graceDays)) {
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

export type DetectionTransaction = {
  id: string;
  accountId: string;
  merchantId: string;
  date: string;
  amount: number;
};

export type PlanProposal = {
  accountId: string;
  merchantId: string;
  freq: PlanFrequency;
  interval: number;
  startDate: string;
  monthDay: number | null;
  expectedAmount: number;
  tolerance: number;
  amountMode: AmountMode;
  transactionIds: string[];
};

const detectionPatterns: { freq: PlanFrequency; interval: number }[] = [
  { freq: "weekly", interval: 1 },
  { freq: "weekly", interval: 2 },
  { freq: "monthly", interval: 1 },
  { freq: "yearly", interval: 1 },
];

function gapDays(left: Temporal.PlainDate, right: Temporal.PlainDate): number {
  return left.until(right, { largestUnit: "day" }).days;
}

function expectedGap(previous: Temporal.PlainDate, freq: PlanFrequency, interval: number): number {
  if (freq === "weekly") {
    return 7 * interval;
  }
  if (freq === "monthly") {
    return gapDays(previous, previous.add({ months: interval }));
  }
  return gapDays(previous, previous.add({ years: interval }));
}

function gapsAgree(dates: readonly Temporal.PlainDate[], freq: PlanFrequency, interval: number): boolean {
  for (let index = 1; index < dates.length; index += 1) {
    const previous = dates[index - 1];
    const next = dates[index];
    if (!previous || !next) {
      return false;
    }
    const actual = gapDays(previous, next);
    if (Math.abs(actual - expectedGap(previous, freq, interval)) > 3) {
      return false;
    }
  }
  return true;
}

function withinTenPercent(amounts: readonly number[]): boolean {
  const mid = medianMinor(amounts);
  if (mid === 0) {
    return amounts.every((amount) => amount === 0);
  }
  return amounts.every((amount) => Math.abs(amount - mid) * 10 <= Math.abs(mid));
}

function proposalFrom(
  rows: readonly DetectionTransaction[],
  pattern: { freq: PlanFrequency; interval: number },
): PlanProposal {
  const amounts = rows.map((row) => row.amount);
  const expectedAmount = medianMinor(amounts);
  const first = rows[0];
  const start = Temporal.PlainDate.from(first?.date ?? "1970-01-01");
  const varied = amounts.some((amount) => amount !== amounts[0]);
  return {
    accountId: first?.accountId ?? "",
    merchantId: first?.merchantId ?? "",
    freq: pattern.freq,
    interval: pattern.interval,
    startDate: start.toString(),
    monthDay: pattern.freq === "weekly" ? null : start.day,
    expectedAmount,
    tolerance: Math.max(...amounts.map((amount) => Math.abs(amount - expectedAmount))),
    amountMode: varied ? "variable" : "fixed",
    transactionIds: rows.map((row) => row.id),
  };
}

function bestProposal(rows: readonly DetectionTransaction[]): PlanProposal | null {
  let best: { length: number; start: number; proposal: PlanProposal } | null = null;
  for (let start = 0; start < rows.length; start += 1) {
    for (let end = start + 3; end <= rows.length; end += 1) {
      const window = rows.slice(start, end);
      const amounts = window.map((row) => row.amount);
      if (!withinTenPercent(amounts)) {
        continue;
      }
      const dates = window.map((row) => Temporal.PlainDate.from(row.date));
      const pattern = detectionPatterns.find((item) => gapsAgree(dates, item.freq, item.interval));
      if (!pattern) {
        continue;
      }
      const length = window.length;
      if (!best || length > best.length || (length === best.length && start > best.start)) {
        best = { length, start, proposal: proposalFrom(window, pattern) };
      }
    }
  }
  return best?.proposal ?? null;
}

export function detectPlans(transactions: readonly DetectionTransaction[]): PlanProposal[] {
  const groups = new Map<string, DetectionTransaction[]>();
  for (const transaction of transactions) {
    const key = `${transaction.accountId}\0${transaction.merchantId}`;
    const rows = groups.get(key) ?? [];
    rows.push(transaction);
    groups.set(key, rows);
  }
  const proposals: PlanProposal[] = [];
  for (const rows of groups.values()) {
    const sorted = [...rows].sort((left, right) => {
      if (left.date !== right.date) {
        return left.date < right.date ? -1 : 1;
      }
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });
    const proposal = bestProposal(sorted);
    if (proposal) {
      proposals.push(proposal);
    }
  }
  proposals.sort((left, right) => {
    if (left.accountId !== right.accountId) {
      return left.accountId < right.accountId ? -1 : 1;
    }
    if (left.merchantId !== right.merchantId) {
      return left.merchantId < right.merchantId ? -1 : 1;
    }
    return left.startDate < right.startDate ? -1 : left.startDate > right.startDate ? 1 : 0;
  });
  return proposals;
}
