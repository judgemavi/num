import { z } from "zod";
import { amountSchema as money } from "./money";
import { expenseSpending, isExpenseLine, monthKeySchema, priorMonths, type FlowLine } from "./month";
import { medianOf } from "./recurring-calc";

export const spendingIncreaseSchema = z.object({
  categoryId: z.uuid(),
  month: monthKeySchema,
  amount: money,
  median: money,
  delta: money,
});

export type SpendingIncrease = z.infer<typeof spendingIncreaseSchema>;

function divRoundHalfAway(numerator: bigint, denominator: bigint) {
  const negative = numerator < 0n !== denominator < 0n;
  const left = numerator < 0n ? -numerator : numerator;
  const right = denominator < 0n ? -denominator : denominator;
  let quotient = left / right;
  const remainder = left % right;
  if (remainder * 2n >= right) {
    quotient += 1n;
  }
  return Number(negative ? -quotient : quotient);
}

/** The savings rate in thousandths of a percent. It is null when income is 0. */
export function savingsRateMilliPct(income: number, spending: number): number | null {
  if (income === 0) {
    return null;
  }
  return divRoundHalfAway(BigInt(income - spending) * 100_000n, BigInt(income));
}

function expenseByMonth(lines: readonly FlowLine[]) {
  const months = new Map<string, Map<string, number>>();
  for (const line of lines) {
    if (!isExpenseLine(line) || line.categoryId === null) {
      continue;
    }
    let categories = months.get(line.month);
    if (!categories) {
      categories = new Map();
      months.set(line.month, categories);
    }
    categories.set(line.categoryId, (categories.get(line.categoryId) ?? 0) + expenseSpending(line.amount));
  }
  return months;
}

function compareId(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

/**
 * The 3 largest increases of one month by category, against the median of the 3 months before it. Home "Needs you" shows them.
 */
export function spendingIncreases(month: string, lines: readonly FlowLine[]): SpendingIncrease[] {
  const byMonth = expenseByMonth(lines);
  const earlier = priorMonths(month);
  const ids = new Set<string>();
  for (const key of [month, ...earlier]) {
    for (const id of byMonth.get(key)?.keys() ?? []) {
      ids.add(id);
    }
  }
  return [...ids]
    .map((categoryId) => {
      const amount = byMonth.get(month)?.get(categoryId) ?? 0;
      const median = medianOf(earlier.map((key) => byMonth.get(key)?.get(categoryId) ?? 0));
      return { categoryId, month, amount, median, delta: amount - median };
    })
    .filter((row) => row.delta > 0)
    .sort((left, right) => right.delta - left.delta || compareId(left.categoryId, right.categoryId))
    .slice(0, 3);
}
