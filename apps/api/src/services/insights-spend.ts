import {
  expenseSpending,
  isExpenseLine,
  isIncomeLine,
  isUncategorizedLine,
  uncategorizedFlows,
  type InsightBreakdown,
  type InsightRow,
} from "@num/shared";
import type { Db } from "../db";
import { loadLedgerLines, type LedgerLine } from "./ledger-lines";

export type SpendFact = LedgerLine;

export type MonthPoint = {
  month: string;
  date: string;
};

type Period = {
  from: string;
  to: string;
};

export function loadSpendFacts(db: Db): SpendFact[] {
  return loadLedgerLines(db);
}

function inPeriod(fact: SpendFact, period: Period): boolean {
  return fact.date >= period.from && fact.date <= period.to;
}

function keysFor(fact: SpendFact, by: InsightBreakdown): string[] {
  if (by === "category") {
    return fact.categoryId ? [fact.categoryId] : [];
  }
  if (by === "group") {
    return [fact.groupId ?? ""];
  }
  if (by === "merchant") {
    return [fact.merchantId ?? ""];
  }
  return fact.tagIds.length > 0 ? fact.tagIds : [""];
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

function row(id: string | null, kind: InsightRow["kind"], amount: number, inflow: number | null): InsightRow {
  return { id, kind, amount, inflow };
}

export function spendingReport(facts: readonly SpendFact[], period: Period, by: InsightBreakdown) {
  let income = 0;
  let spending = 0;
  const uncategorizedAmounts: number[] = [];
  const totals = new Map<string, number>();
  for (const fact of facts) {
    if (!inPeriod(fact, period)) {
      continue;
    }
    if (isIncomeLine(fact)) {
      income += fact.amount;
    }
    if (isExpenseLine(fact)) {
      const spent = expenseSpending(fact.amount);
      spending += spent;
      for (const key of keysFor(fact, by)) {
        totals.set(key, (totals.get(key) ?? 0) + spent);
      }
    }
    if (isUncategorizedLine(fact)) {
      uncategorizedAmounts.push(fact.amount);
    }
  }
  const rows: InsightRow[] = [];
  for (const [key, amount] of totals) {
    if (amount === 0) {
      continue;
    }
    rows.push(key === "" ? row(null, "none", amount, null) : row(key, "item", amount, null));
  }
  rows.sort(compareRows);
  if (uncategorizedAmounts.length > 0) {
    const flows = uncategorizedFlows(uncategorizedAmounts);
    rows.push(row(null, "uncategorized", flows.spent, flows.inflow));
  }
  return { income, spending, savings: income - spending, rows };
}

function inMonth(fact: SpendFact, point: MonthPoint): boolean {
  return fact.month === point.month && fact.date <= point.date;
}

export function trendReport(facts: readonly SpendFact[], months: readonly MonthPoint[], categoryId: string | null) {
  const trend = months.map((point) => {
    let spending = 0;
    let income = 0;
    for (const fact of facts) {
      if (!inMonth(fact, point)) {
        continue;
      }
      if (isExpenseLine(fact)) {
        spending += expenseSpending(fact.amount);
      }
      if (isIncomeLine(fact)) {
        income += fact.amount;
      }
    }
    return { month: point.month, spending, income };
  });
  const categoryTrend =
    categoryId === null
      ? null
      : months.map((point) => {
          let spending = 0;
          for (const fact of facts) {
            if (inMonth(fact, point) && isExpenseLine(fact) && fact.categoryId === categoryId) {
              spending += expenseSpending(fact.amount);
            }
          }
          return { month: point.month, spending };
        });
  return { trend, categoryTrend };
}
