import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { isIsoDate } from "./date";

export function isMonthKey(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value) && isIsoDate(`${value}-01`);
}

export const monthKeySchema = z.string().refine(isMonthKey);

export function monthLastDay(month: string): string {
  const date = Temporal.PlainDate.from(`${month}-01`);
  return date.with({ day: date.daysInMonth }).toString();
}

export function priorMonths(month: string): [string, string, string] {
  const start = Temporal.PlainDate.from(`${month}-01`);
  const months = [3, 2, 1].map((count) => start.subtract({ months: count }).toString().slice(0, 7));
  return [months[0] ?? month, months[1] ?? month, months[2] ?? month];
}

/**
 * The last `count` complete months, oldest first.
 * A complete month is a calendar month whose last day is before `asOf`
 * and that is not before the month of the first transaction in the book.
 */
export function completeMonths(asOf: string, firstDate: string | null, count: number): string[] {
  if (firstDate === null) {
    return [];
  }
  const firstMonth = firstDate.slice(0, 7);
  const months: string[] = [];
  let cursor = Temporal.PlainDate.from(asOf).with({ day: 1 }).subtract({ months: 1 });
  while (months.length < count && cursor.toString().slice(0, 7) >= firstMonth) {
    months.unshift(cursor.toString().slice(0, 7));
    cursor = cursor.subtract({ months: 1 });
  }
  return months;
}

export type FlowLine = {
  month: string;
  amount: number;
  categoryId: string | null;
  kind: "income" | "expense" | null;
  transfer: boolean;
};

export function flowLineKind(value: string | null): FlowLine["kind"] {
  if (value === "income" || value === "expense") {
    return value;
  }
  return null;
}

export function isExpenseLine(line: Pick<FlowLine, "transfer" | "kind" | "categoryId">): boolean {
  return !line.transfer && line.kind === "expense" && line.categoryId !== null;
}

export function isIncomeLine(line: Pick<FlowLine, "transfer" | "kind" | "categoryId">): boolean {
  return !line.transfer && line.kind === "income" && line.categoryId !== null;
}

export function isUncategorizedLine(line: Pick<FlowLine, "transfer" | "categoryId">): boolean {
  return !line.transfer && line.categoryId === null;
}

export function expenseSpending(amount: number): number {
  return -amount;
}

export function uncategorizedFlows(amounts: readonly number[]): { spent: number; inflow: number } {
  let spent = 0;
  let inflow = 0;
  for (const amount of amounts) {
    if (amount < 0) {
      spent -= amount;
    } else if (amount > 0) {
      inflow += amount;
    }
  }
  return { spent, inflow };
}
