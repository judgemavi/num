import {
  expenseSpending,
  isExpenseLine,
  isIncomeLine,
  isUncategorizedLine,
  savingsRateMilliPct,
  uncategorizedFlows,
  type IdentityColor,
  type InsightGroupRow,
  type InsightRow,
} from "@num/shared";
import type { LedgerLine } from "./ledger-lines";
import type { Period } from "./insights-period";

function inPeriod(fact: LedgerLine, period: Period) {
  return fact.date >= period.from && fact.date <= period.to;
}

function compareRows(left: InsightRow, right: InsightRow) {
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
  const rows = [...totals].map(([id, amount]): InsightRow => ({ id, kind: "item", amount, inflow: null }));
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
    if (isExpenseLine(fact) || fact.debtAccountId !== null) {
      spending += expenseSpending(fact.amount);
    }
  }
  return { income, spending, savings: income - spending, savingsRateMilliPct: savingsRateMilliPct(income, spending) };
}

/**
 * Spending by group, each with its categories, largest first. Refunds decrease spending. A group or a category
 * with lines stays in the list, also when its spending is zero or less. Categories with no group are the "none"
 * group. Uncategorized lines are one last row with no categories.
 */
export function groupRows(facts: readonly LedgerLine[], period: Period, colors: ReadonlyMap<string, IdentityColor>): InsightGroupRow[] {
  const groups = new Map<string, Map<string, number>>();
  const uncategorized: number[] = [];
  for (const fact of facts) {
    if (!inPeriod(fact, period)) {
      continue;
    }
    if (isExpenseLine(fact) && fact.categoryId !== null) {
      const categories = groups.get(fact.groupId ?? "") ?? new Map<string, number>();
      addTo(categories, fact.categoryId, expenseSpending(fact.amount));
      groups.set(fact.groupId ?? "", categories);
    }
    if (isUncategorizedLine(fact)) {
      uncategorized.push(fact.amount);
    }
  }
  const rows = [...groups].map(([key, totals]): InsightGroupRow => {
    const categories = itemRows(totals);
    const amount = categories.reduce((sum, row) => sum + row.amount, 0);
    return { id: key === "" ? null : key, kind: key === "" ? "none" : "item", amount, inflow: null, color: colors.get(key) ?? null, categories: categories.map((row) => ({ ...row, increase: null })) };
  });
  rows.sort(compareRows);
  if (uncategorized.length > 0) {
    const flows = uncategorizedFlows(uncategorized);
    rows.push({ id: null, kind: "uncategorized", amount: flows.spent, inflow: flows.inflow, color: null, categories: [] });
  }
  return rows;
}

/** Principal paid from an on-budget account, by mortgage or loan account. */
export function debtPaymentRows(facts: readonly LedgerLine[], period: Period) {
  const totals = new Map<string, number>();
  for (const fact of facts) {
    if (inPeriod(fact, period) && fact.debtAccountId !== null) {
      addTo(totals, fact.debtAccountId, -fact.amount);
    }
  }
  return [...totals].map(([accountId, amount]) => ({ accountId, amount }))
    .sort((a, b) => b.amount - a.amount || (a.accountId < b.accountId ? -1 : a.accountId > b.accountId ? 1 : 0));
}
