import { daysBetween } from "./date";
import { Temporal } from "temporal-polyfill";
import { medianAmount, type AmountMode, type PlanFrequency } from "./recurring-calc";

/**
 * `plain` is true for a transaction with one line that is not a transfer. `categoryId` is the category of that line.
 * `transferAccountId` is the target of the one transfer line of a transfer or a loan payment.
 */
export type DetectionTransaction = {
  id: string;
  accountId: string;
  merchantId: string | null;
  plain: boolean;
  categoryId: string | null;
  transferAccountId: string | null;
  date: string;
  amount: number;
};

/**
 * A proposal has a merchant, or else a category, or else a transfer target.
 * With none, it groups one exact amount.
 */
export type PlanProposal = {
  accountId: string;
  merchantId: string | null;
  categoryId: string | null;
  transferAccountId: string | null;
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

function expectedGap(previous: Temporal.PlainDate, freq: PlanFrequency, interval: number) {
  if (freq === "weekly") {
    return 7 * interval;
  }
  if (freq === "monthly") {
    return daysBetween(previous, previous.add({ months: interval }));
  }
  return daysBetween(previous, previous.add({ years: interval }));
}

function withinTenPercent(amounts: readonly number[]) {
  const mid = medianAmount(amounts, 1);
  if (mid === 0) {
    return amounts.every((amount) => amount === 0);
  }
  return amounts.every((amount) => Math.abs(amount - mid) * 10 <= Math.abs(mid));
}

function proposalFrom(
  rows: readonly DetectionTransaction[],
  pattern: { freq: PlanFrequency; interval: number },
  step: number,
): PlanProposal {
  const amounts = rows.map((row) => row.amount);
  const expectedAmount = medianAmount(amounts, step);
  const first = rows[0];
  const start = Temporal.PlainDate.from(first?.date ?? "1970-01-01");
  const varied = amounts.some((amount) => amount !== amounts[0]);
  const merchantId = first?.merchantId ?? null;
  return {
    accountId: first?.accountId ?? "",
    merchantId,
    categoryId: merchantId ? null : (first?.categoryId ?? null),
    transferAccountId: merchantId ? null : (first?.transferAccountId ?? null),
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
  const actual = daysBetween(previous, next);
  return detectionPatterns.find(
    (pattern) => Math.abs(actual - expectedGap(previous, pattern.freq, pattern.interval)) <= 3,
  );
}

function latestRun(sorted: readonly DetectionTransaction[], step: number): PlanProposal | null {
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
    if (Math.abs(daysBetween(left, right) - expectedGap(left, pattern.freq, pattern.interval)) > 3) {
      break;
    }
    start -= 1;
  }
  // An old amount outside the band (a first bill with a fee) does not stop the later regular rows.
  while (sorted.length - start >= 3) {
    const window = sorted.slice(start);
    if (withinTenPercent(window.map((row) => row.amount))) {
      return proposalFrom(window, pattern, step);
    }
    start += 1;
  }
  return null;
}

/**
 * The group of a transaction: its merchant; else its category; else its exact amount.
 * With no merchant, money out with one transfer line (a transfer or a loan payment) goes in the group of the
 * transfer target. Other splits and transfers are in no group.
 */
function groupKey(transaction: DetectionTransaction) {
  if (transaction.merchantId) {
    return `merchant\0${transaction.merchantId}`;
  }
  if (transaction.transferAccountId) {
    return transaction.amount < 0 ? `transfer\0${transaction.transferAccountId}` : null;
  }
  if (!transaction.plain) {
    return null;
  }
  return transaction.categoryId ? `category\0${transaction.categoryId}` : `amount\0${transaction.amount}`;
}

/** What a proposal is about: its merchant, its transfer target, its category or its one amount. */
export function proposalSubject(item: Pick<PlanProposal, "merchantId" | "categoryId" | "transferAccountId" | "expectedAmount">): string {
  if (item.merchantId) {
    return item.merchantId;
  }
  if (item.transferAccountId) {
    return `transfer-${item.transferAccountId}`;
  }
  return item.categoryId ? `category-${item.categoryId}` : `amount-${item.expectedAmount}`;
}

/** `step` is the milliunits in one minor unit of the book currency. */
export function detectPlans(transactions: readonly DetectionTransaction[], step: number, asOf?: string): PlanProposal[] {
  const since = asOf ? Temporal.PlainDate.from(asOf).subtract({ months: 18 }).toString() : null;
  const groups = new Map<string, DetectionTransaction[]>();
  for (const transaction of transactions) {
    if (since && (transaction.date < since || (asOf !== undefined && transaction.date > asOf))) {
      continue;
    }
    const group = groupKey(transaction);
    if (!group) {
      continue;
    }
    const key = `${transaction.accountId}\0${group}`;
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
    const proposal = latestRun(sorted, step);
    if (proposal) {
      proposals.push(proposal);
    }
  }
  proposals.sort((left, right) => {
    if (left.accountId !== right.accountId) {
      return left.accountId < right.accountId ? -1 : 1;
    }
    const leftSubject = proposalSubject(left);
    const rightSubject = proposalSubject(right);
    if (leftSubject !== rightSubject) {
      return leftSubject < rightSubject ? -1 : 1;
    }
    return left.startDate < right.startDate ? -1 : left.startDate > right.startDate ? 1 : 0;
  });
  return proposals;
}
