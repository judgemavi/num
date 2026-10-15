import { transactions } from "@num/db";
import { monthLastDay, Temporal, type InsightWindow } from "@num/shared";
import { sql } from "drizzle-orm";
import type { Reader } from "./write";
import { ServiceError } from "../service-error";

export type Period = {
  from: string;
  to: string;
};

function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}

export function firstTransactionDate(db: Reader): string | null {
  const row = db.select({ first: sql<string | null>`min(${transactions.date})` }).from(transactions).get();
  return row?.first ?? null;
}

/** The actual part of Insights: the selected window, up to asOf. */
export function windowPeriod(
  asOf: string,
  window: InsightWindow,
  custom: { from?: string; to?: string },
  firstDate: string | null,
): Period {
  let from: string;
  let to = asOf;
  if (window === "custom") {
    from = custom.from ?? asOf;
    to = custom.to && custom.to < asOf ? custom.to : asOf;
  } else if (window === "all") {
    from = firstDate && firstDate < asOf ? firstDate : monthStart(asOf);
  } else {
    from = Temporal.PlainDate.from(monthStart(asOf))
      .subtract({ months: Number(window) - 1 })
      .toString();
  }
  if (from > to) {
    throw new ServiceError("period_invalid", 400);
  }
  return { from, to };
}

/** The donut and the lists use one month of the period when the user selects a month. */
export function breakdownRange(period: Period, month: string | undefined): Period {
  if (month === undefined) {
    return period;
  }
  const first = `${month}-01`;
  const last = monthLastDay(month);
  const range = {
    from: first > period.from ? first : period.from,
    to: last < period.to ? last : period.to,
  };
  if (range.from > range.to) {
    throw new ServiceError("period_invalid", 400);
  }
  return range;
}

export function periodMonths(from: string, to: string): string[] {
  const months: string[] = [];
  let cursor = Temporal.PlainDate.from(monthStart(from));
  const end = to.slice(0, 7);
  while (cursor.toString().slice(0, 7) <= end) {
    months.push(cursor.toString().slice(0, 7));
    cursor = cursor.add({ months: 1 });
  }
  return months;
}
