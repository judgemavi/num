import { dayDistance } from "./date";
import { linkWindowStart, withinTolerance, type PlanSchedule } from "./recurring-calc";
import { addPeriods, occurrenceWindows } from "./recurring-window";

/** An occurrence with no link. A transaction can match it when its date is from `start` (included) to `end` (not included). */
export type OpenOccurrence = {
  bucketId: string;
  dueDate: string;
  start: string;
  end: string;
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
  bucketId: string;
  dueDate: string;
  transactionId: string;
};

export type AmbiguousLink = {
  bucketId: string;
  dueDate: string;
  transactionIds: string[];
};

type LinkSchedule = PlanSchedule & {
  id: string;
  accountId: string;
  merchantId: string | null;
  expectedAmount: number;
  tolerance: number;
};

function occurrenceKey(bucketId: string, dueDate: string) {
  return `${bucketId}|${dueDate}`;
}

/**
 * The occurrences that a transaction can link to on `asOf`: due from the later of the start date and `asOf` − 13
 * months, with a window that starts on or before `asOf`, and with no link or skip (`closed` has `bucketId|dueDate`).
 */
export function openOccurrences(schedules: readonly LinkSchedule[], closed: ReadonlySet<string>, asOf: string): OpenOccurrence[] {
  return schedules.flatMap((row) =>
    occurrenceWindows(row, addPeriods(row, asOf, 1), linkWindowStart(row.startDate, asOf))
      .filter((window) => window.start <= asOf && !closed.has(occurrenceKey(row.id, window.dueDate)))
      .map((window) => ({
        bucketId: row.id,
        dueDate: window.dueDate,
        start: window.start,
        end: window.end,
        accountId: row.accountId,
        merchantId: row.merchantId,
        expectedAmount: row.expectedAmount,
        tolerance: row.tolerance,
      })),
  );
}

/** The dates of the transactions that can match one of `occurrences`: from the first start to the last end (not included). */
export function linkDateRange(occurrences: readonly OpenOccurrence[]): { from: string; before: string } | null {
  if (occurrences.length === 0) {
    return null;
  }
  return {
    from: occurrences.reduce((min, item) => (item.start < min ? item.start : min), occurrences[0]?.start ?? ""),
    before: occurrences.reduce((max, item) => (item.end > max ? item.end : max), occurrences[0]?.end ?? ""),
  };
}

export function isLinkCandidate(occurrence: OpenOccurrence, transaction: LinkTransaction): boolean {
  if (transaction.accountId !== occurrence.accountId) {
    return false;
  }
  if (transaction.date < occurrence.start || transaction.date >= occurrence.end) {
    return false;
  }
  if (occurrence.merchantId && transaction.merchantId !== occurrence.merchantId) {
    return false;
  }
  return withinTolerance(transaction.amount, occurrence.expectedAmount, occurrence.tolerance);
}

function lowerBound(rows: readonly LinkTransaction[], date: string) {
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

function byAccountAndDate(transactions: readonly LinkTransaction[]) {
  const byAccount = new Map<string, LinkTransaction[]>();
  for (const transaction of transactions) {
    const rows = byAccount.get(transaction.accountId) ?? [];
    rows.push(transaction);
    byAccount.set(transaction.accountId, rows);
  }
  for (const rows of byAccount.values()) {
    rows.sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : left.id < right.id ? -1 : 1));
  }
  return byAccount;
}

/** The candidates of one occurrence: the matching transactions with the date nearest to the due date. */
function nearest(occurrence: OpenOccurrence, rows: readonly LinkTransaction[]): string[] {
  const matches: LinkTransaction[] = [];
  for (let index = lowerBound(rows, occurrence.start); index < lowerBound(rows, occurrence.end); index += 1) {
    const transaction = rows[index];
    if (transaction && isLinkCandidate(occurrence, transaction)) {
      matches.push(transaction);
    }
  }
  const best = Math.min(...matches.map((transaction) => dayDistance(transaction.date, occurrence.dueDate)));
  return matches.filter((transaction) => dayDistance(transaction.date, occurrence.dueDate) === best).map((transaction) => transaction.id);
}

/**
 * The links of the open occurrences. The candidate of an occurrence is the matching transaction with the date nearest to
 * the due date. One candidate that no other occurrence has: a unique link. Two candidates at the same distance, or a
 * candidate of more than one occurrence: the transaction needs review.
 */
export function matchLinks(
  occurrences: readonly OpenOccurrence[],
  transactions: readonly LinkTransaction[],
): { unique: UniqueLink[]; ambiguous: AmbiguousLink[] } {
  const byAccount = byAccountAndDate(transactions);
  const byOccurrence = new Map<string, string[]>();
  const byTransaction = new Map<string, number>();
  for (const occurrence of occurrences) {
    const ids = nearest(occurrence, byAccount.get(occurrence.accountId) ?? []);
    byOccurrence.set(occurrenceKey(occurrence.bucketId, occurrence.dueDate), ids);
    for (const id of ids) {
      byTransaction.set(id, (byTransaction.get(id) ?? 0) + 1);
    }
  }
  const unique: UniqueLink[] = [];
  const ambiguous: AmbiguousLink[] = [];
  for (const occurrence of occurrences) {
    const ids = byOccurrence.get(occurrenceKey(occurrence.bucketId, occurrence.dueDate)) ?? [];
    if (ids.length === 0) {
      continue;
    }
    const sole = ids.length === 1 ? ids[0] : undefined;
    if (sole && byTransaction.get(sole) === 1) {
      unique.push({ bucketId: occurrence.bucketId, dueDate: occurrence.dueDate, transactionId: sole });
      continue;
    }
    ambiguous.push({ bucketId: occurrence.bucketId, dueDate: occurrence.dueDate, transactionIds: ids });
  }
  return { unique, ambiguous };
}
