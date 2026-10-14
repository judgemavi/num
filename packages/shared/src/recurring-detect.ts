import { Temporal } from "temporal-polyfill";
import { medianMinor, type AmountMode, type PlanFrequency } from "./recurring-calc";

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

function gapDays(left: Temporal.PlainDate, right: Temporal.PlainDate) {
  return left.until(right, { largestUnit: "day" }).days;
}

function expectedGap(previous: Temporal.PlainDate, freq: PlanFrequency, interval: number) {
  if (freq === "weekly") {
    return 7 * interval;
  }
  if (freq === "monthly") {
    return gapDays(previous, previous.add({ months: interval }));
  }
  return gapDays(previous, previous.add({ years: interval }));
}

function withinTenPercent(amounts: readonly number[]) {
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

function patternForGap(previous: Temporal.PlainDate, next: Temporal.PlainDate) {
  const actual = gapDays(previous, next);
  return detectionPatterns.find(
    (pattern) => Math.abs(actual - expectedGap(previous, pattern.freq, pattern.interval)) <= 3,
  );
}

function latestRun(sorted: readonly DetectionTransaction[]): PlanProposal | null {
  if (sorted.length < 3) {
    return null;
  }
  const dates = sorted.map((row) => Temporal.PlainDate.from(row.date));
  const last = dates.length - 1;
  const previous = dates[last - 1];
  const current = dates[last];
  if (!previous || !current) {
    return null;
  }
  const pattern = patternForGap(previous, current);
  if (!pattern) {
    return null;
  }
  let start = last - 1;
  while (start > 0) {
    const left = dates[start - 1];
    const right = dates[start];
    if (!left || !right) {
      break;
    }
    if (Math.abs(gapDays(left, right) - expectedGap(left, pattern.freq, pattern.interval)) > 3) {
      break;
    }
    start -= 1;
  }
  const window = sorted.slice(start);
  if (window.length < 3 || !withinTenPercent(window.map((row) => row.amount))) {
    return null;
  }
  return proposalFrom(window, pattern);
}

export function detectPlans(transactions: readonly DetectionTransaction[], asOf?: string): PlanProposal[] {
  const since = asOf ? Temporal.PlainDate.from(asOf).subtract({ months: 18 }).toString() : null;
  const groups = new Map<string, DetectionTransaction[]>();
  for (const transaction of transactions) {
    if (since && (transaction.date < since || (asOf !== undefined && transaction.date > asOf))) {
      continue;
    }
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
    const proposal = latestRun(sorted);
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
