import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { isoDateSchema } from "./date";
import { isMonthKey } from "./month";
import { roundToStep } from "./currency";
import { amountSchema } from "./money";

export const forecastDayCount = 90;

const monthFlowSchema = z.object({
  month: z.string().refine(isMonthKey),
  income: amountSchema,
  spending: amountSchema,
});

export const forecastSchema = z.object({
  asOf: isoDateSchema,
  dates: z.array(isoDateSchema).length(forecastDayCount),
  /** The total balance of the open on-budget accounts at the end of each day. */
  total: z.array(amountSchema).length(forecastDayCount),
  months: z.array(monthFlowSchema),
});

export type Forecast = z.infer<typeof forecastSchema>;
export type ForecastMonth = z.infer<typeof monthFlowSchema>;

/** A change of the on-budget total on one day. */
export type ForecastDelta = {
  date: string;
  amount: number;
};

/** Income and spending of one forecast day. Spending is positive when money goes out. `bucketId` is the bucket of the flow, or null. */
export type ForecastFlow = {
  date: string;
  income: number;
  spending: number;
  bucketId: string | null;
};

/** `balance` is the on-budget total on `asOf`. */
export type ForecastInput = {
  asOf: string;
  balance: number;
  deltas: ForecastDelta[];
  flows: ForecastFlow[];
};

export function forecastDates(asOf: string): string[] {
  const start = Temporal.PlainDate.from(asOf);
  return Array.from({ length: forecastDayCount }, (_, index) => start.add({ days: index }).toString());
}

/** The daily deltas of each monthly spending item. Each delta keeps the bucket of its item. */
export function spendDeltas(
  dates: readonly string[],
  items: readonly { monthly: number; bucketId: string | null }[],
  step: number,
): (ForecastDelta & { bucketId: string | null })[] {
  const days = dates.map((date) => ({ date, day: Temporal.PlainDate.from(date) }));
  const shares = new Map<string, number[]>();
  const deltas: (ForecastDelta & { bucketId: string | null })[] = [];
  for (const item of items) {
    if (item.monthly <= 0) {
      continue;
    }
    for (const { date, day } of days) {
      const key = `${item.monthly}|${day.year}-${day.month}`;
      let monthShares = shares.get(key);
      if (!monthShares) {
        monthShares = dailyShares(item.monthly, day.daysInMonth, step);
        shares.set(key, monthShares);
      }
      const share = monthShares[day.day - 1] ?? 0;
      if (share === 0) {
        continue;
      }
      deltas.push({ date, amount: -share, bucketId: item.bucketId });
    }
  }
  return deltas;
}

function forecastMonths(dates: readonly string[], flows: readonly ForecastFlow[]) {
  const days = new Set(dates);
  const months = new Map<string, ForecastMonth>();
  for (const date of dates) {
    const month = date.slice(0, 7);
    if (!months.has(month)) {
      months.set(month, { month, income: 0, spending: 0 });
    }
  }
  for (const flow of flows) {
    const month = months.get(flow.date.slice(0, 7));
    if (!month || !days.has(flow.date)) {
      continue;
    }
    month.income += flow.income;
    month.spending += flow.spending;
  }
  return [...months.values()];
}

/** Spreads a monthly amount over the days of the month in whole minor units. The first days get the remainder. */
function dailyShares(total: number, daysInMonth: number, step: number) {
  const units = roundToStep(total, step) / step;
  const base = Math.floor(units / daysInMonth);
  const extra = units % daysInMonth;
  return Array.from({ length: daysInMonth }, (_, index) => (index < extra ? base + 1 : base) * step);
}

export function buildForecast(input: ForecastInput): Forecast {
  const dates = forecastDates(input.asOf);
  const indexOf = new Map(dates.map((date, index) => [date, index]));
  const dayDeltas = dates.map(() => 0);
  for (const delta of input.deltas) {
    const index = indexOf.get(delta.date);
    if (index !== undefined) {
      dayDeltas[index] = (dayDeltas[index] ?? 0) + delta.amount;
    }
  }
  let running = input.balance;
  const total = dayDeltas.map((amount) => (running += amount));
  return {
    asOf: input.asOf,
    dates,
    total,
    months: forecastMonths(dates, input.flows),
  };
}
