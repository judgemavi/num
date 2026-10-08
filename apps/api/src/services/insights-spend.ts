import { categories, lineTags, transactionLines, transactions } from "@num/db";
import type { InsightBreakdown, InsightRow } from "@num/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db";

export type SpendFact = {
  date: string;
  month: string;
  amount: number;
  categoryId: string | null;
  groupId: string | null;
  merchantId: string | null;
  kind: "income" | "expense" | null;
  transfer: boolean;
  tagIds: string[];
};

export type MonthPoint = {
  month: string;
  date: string;
};

type Period = {
  from: string;
  to: string;
};

function kindOf(value: string | null): SpendFact["kind"] {
  if (value === "income" || value === "expense") {
    return value;
  }
  return null;
}

export function loadSpendFacts(db: Db): SpendFact[] {
  const rows = db
    .select({
      lineId: transactionLines.id,
      date: transactions.date,
      amount: transactionLines.amount,
      categoryId: transactionLines.categoryId,
      groupId: categories.groupId,
      merchantId: transactions.merchantId,
      kind: categories.kind,
      transferAccountId: transactionLines.transferAccountId,
    })
    .from(transactionLines)
    .innerJoin(transactions, eq(transactionLines.transactionId, transactions.id))
    .leftJoin(categories, eq(transactionLines.categoryId, categories.id))
    .where(and(isNull(transactions.deletedAt)))
    .all();
  const tags = db.select({ lineId: lineTags.lineId, tagId: lineTags.tagId }).from(lineTags).all();
  const byLine = new Map<string, string[]>();
  for (const tag of tags) {
    const list = byLine.get(tag.lineId) ?? [];
    list.push(tag.tagId);
    byLine.set(tag.lineId, list);
  }
  return rows.map((row) => ({
    date: row.date,
    month: row.date.slice(0, 7),
    amount: row.amount,
    categoryId: row.categoryId,
    groupId: row.groupId,
    merchantId: row.merchantId,
    kind: kindOf(row.kind),
    transfer: row.transferAccountId !== null,
    tagIds: byLine.get(row.lineId) ?? [],
  }));
}

function inPeriod(fact: SpendFact, period: Period): boolean {
  return fact.date >= period.from && fact.date <= period.to;
}

function isExpense(fact: SpendFact): boolean {
  return !fact.transfer && fact.kind === "expense" && fact.categoryId !== null;
}

function isIncome(fact: SpendFact): boolean {
  return !fact.transfer && fact.kind === "income" && fact.categoryId !== null;
}

function isUncategorized(fact: SpendFact): boolean {
  return !fact.transfer && fact.categoryId === null;
}

function spendingOf(fact: SpendFact): number {
  return -fact.amount;
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

export function spendingReport(facts: readonly SpendFact[], period: Period, by: InsightBreakdown) {
  let income = 0;
  let spending = 0;
  let uncategorized = 0;
  let uncategorizedCount = 0;
  const totals = new Map<string, number>();
  for (const fact of facts) {
    if (!inPeriod(fact, period)) {
      continue;
    }
    if (isIncome(fact)) {
      income += fact.amount;
    }
    if (isExpense(fact)) {
      const spent = spendingOf(fact);
      spending += spent;
      for (const key of keysFor(fact, by)) {
        totals.set(key, (totals.get(key) ?? 0) + spent);
      }
    }
    if (isUncategorized(fact)) {
      uncategorized += fact.amount;
      uncategorizedCount += 1;
    }
  }
  const rows: InsightRow[] = [];
  for (const [key, amount] of totals) {
    if (amount === 0) {
      continue;
    }
    rows.push(key === "" ? { id: null, kind: "none", amount } : { id: key, kind: "item", amount });
  }
  rows.sort(compareRows);
  if (uncategorizedCount > 0) {
    rows.push({ id: null, kind: "uncategorized", amount: uncategorized });
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
      if (isExpense(fact)) {
        spending += spendingOf(fact);
      }
      if (isIncome(fact)) {
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
            if (inMonth(fact, point) && isExpense(fact) && fact.categoryId === categoryId) {
              spending += spendingOf(fact);
            }
          }
          return { month: point.month, spending };
        });
  return { trend, categoryTrend };
}
