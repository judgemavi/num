import {
  expenseSpending,
  isExpenseLine,
  isIncomeLine,
  isUncategorizedLine,
  savingsRateMilliPct,
  uncategorizedFlows,
  type InsightRow,
} from "@num/shared";
import type { LedgerLine } from "./ledger-lines";
import type { Period } from "./insights-period";

/** The donut level: all groups, or the categories of one group ("none" = categories with no group). */
export type DonutLevel = { group: string | null };

function inPeriod(fact: LedgerLine, period: Period): boolean {
  return fact.date >= period.from && fact.date <= period.to;
}

function compareRows(left: InsightRow, right: InsightRow): number {
  if (left.amount !== right.amount) {
    return right.amount - left.amount;
  }
  const leftId = left.id ?? "";
  const rightId = right.id ?? "";
  if (leftId < rightId) {
    return -1;
  }
  return leftId > rightId ? 1 : 0;
}

function itemRows(totals: Map<string, number>): InsightRow[] {
  const rows: InsightRow[] = [];
  for (const [key, amount] of totals) {
    rows.push(key === "" ? { id: null, kind: "none", amount, inflow: null } : { id: key, kind: "item", amount, inflow: null });
  }
  return rows.sort(compareRows);
}

function addTo(totals: Map<string, number>, key: string, amount: number) {
  totals.set(key, (totals.get(key) ?? 0) + amount);
}

export function spendTotals(facts: readonly LedgerLine[], period: Period) {
  let income = 0;
  let spending = 0;
  for (const fact of facts) {
    if (!inPeriod(fact, period)) {
      continue;
    }
    if (isIncomeLine(fact)) {
      income += fact.amount;
    }
    if (isExpenseLine(fact)) {
      spending += expenseSpending(fact.amount);
    }
  }
  return { income, spending, savings: income - spending, savingsRateMilliPct: savingsRateMilliPct(income, spending) };
}

/**
 * Rows of one donut level. Refunds decrease spending. An item with lines stays in the list,
 * also when its spending is zero or less. Uncategorized lines are one row at level 1.
 */
export function donutRows(facts: readonly LedgerLine[], period: Period, level: DonutLevel): InsightRow[] {
  const totals = new Map<string, number>();
  const uncategorized: number[] = [];
  for (const fact of facts) {
    if (!inPeriod(fact, period)) {
      continue;
    }
    if (isExpenseLine(fact)) {
      const spent = expenseSpending(fact.amount);
      if (level.group === null) {
        addTo(totals, fact.groupId ?? "", spent);
      } else if ((fact.groupId ?? "none") === level.group && fact.categoryId !== null) {
        addTo(totals, fact.categoryId, spent);
      }
    }
    if (level.group === null && isUncategorizedLine(fact)) {
      uncategorized.push(fact.amount);
    }
  }
  const rows = itemRows(totals);
  if (uncategorized.length > 0) {
    const flows = uncategorizedFlows(uncategorized);
    rows.push({ id: null, kind: "uncategorized", amount: flows.spent, inflow: flows.inflow });
  }
  return rows;
}

export function categoryRow(facts: readonly LedgerLine[], period: Period, categoryId: string): InsightRow {
  let amount = 0;
  for (const fact of facts) {
    if (inPeriod(fact, period) && isExpenseLine(fact) && fact.categoryId === categoryId) {
      amount += expenseSpending(fact.amount);
    }
  }
  return { id: categoryId, kind: "item", amount, inflow: null };
}

/**
 * Spending by merchant or by tag, largest first.
 * With `noneRow`, a line with no key goes to the "none" row. Without it, the line is not in the list.
 */
export function spendRows(
  facts: readonly LedgerLine[],
  period: Period,
  keysOf: (fact: LedgerLine) => string[],
  noneRow: boolean,
): InsightRow[] {
  const totals = new Map<string, number>();
  for (const fact of facts) {
    if (!inPeriod(fact, period) || !isExpenseLine(fact)) {
      continue;
    }
    const keys = keysOf(fact);
    for (const key of keys.length > 0 || !noneRow ? keys : [""]) {
      addTo(totals, key, expenseSpending(fact.amount));
    }
  }
  return itemRows(totals);
}
