import { z } from "zod";
import { centsSchema as cents } from "./money";
import { expenseSpending, isExpenseLine, monthKeySchema, priorMonths, type FlowLine } from "./month";
import { medianMinor } from "./recurring-calc";

const categoryChangeSchema = z.object({
  categoryId: z.uuid(),
  amount: cents,
  median: cents,
  delta: cents,
});

export const insightChangesSchema = z.object({
  month: monthKeySchema,
  increases: z.array(categoryChangeSchema).max(3),
  decreases: z.array(categoryChangeSchema).max(3),
  newMerchants: z.array(z.object({ merchantId: z.uuid() })),
});

export type InsightChanges = z.infer<typeof insightChangesSchema>;

export type MerchantFirstMonth = {
  merchantId: string;
  firstMonth: string;
};

export type InsightChangesInput = {
  month: string;
  lines: readonly FlowLine[];
  merchants: readonly MerchantFirstMonth[];
};

function divRoundHalfAway(numerator: bigint, denominator: bigint): number {
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

function expenseByMonth(lines: readonly FlowLine[]): Map<string, Map<string, number>> {
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

function categoryChanges(byMonth: Map<string, Map<string, number>>, month: string) {
  const earlier = priorMonths(month);
  const ids = new Set<string>();
  for (const key of [month, ...earlier]) {
    for (const id of byMonth.get(key)?.keys() ?? []) {
      ids.add(id);
    }
  }
  const changes = [...ids].map((categoryId) => {
    const amount = byMonth.get(month)?.get(categoryId) ?? 0;
    const median = medianMinor(earlier.map((key) => byMonth.get(key)?.get(categoryId) ?? 0));
    return { categoryId, amount, median, delta: amount - median };
  });
  const increases = changes
    .filter((row) => row.delta > 0)
    .sort((left, right) => right.delta - left.delta || compareId(left.categoryId, right.categoryId))
    .slice(0, 3);
  const decreases = changes
    .filter((row) => row.delta < 0)
    .sort((left, right) => left.delta - right.delta || compareId(left.categoryId, right.categoryId))
    .slice(0, 3);
  return { increases, decreases };
}

/**
 * The changes of one month: the 3 largest increases and decreases by category against the median
 * of the 3 months before it, and the merchants whose first transaction is in the month.
 */
export function buildInsightChanges(input: InsightChangesInput): InsightChanges {
  const { increases, decreases } = categoryChanges(expenseByMonth(input.lines), input.month);
  return {
    month: input.month,
    increases,
    decreases,
    newMerchants: input.merchants
      .filter((row) => row.firstMonth === input.month)
      .map((row) => ({ merchantId: row.merchantId }))
      .sort((left, right) => compareId(left.merchantId, right.merchantId)),
  };
}
