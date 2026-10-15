import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { AccountKind, PaymentPolicy } from "./account";
import { isoDateSchema } from "./date";
import { isMonthKey } from "./month";
import { roundToStep } from "./currency";
import { medianAmount, medianOf } from "./recurring-calc";
import { amountSchema } from "./money";

export const forecastDayCount = 90;

/** The safe-to-spend window when no income has `payday` (spec §6). */
export const noPaydayWindowDays = 30;

export const forecastWarningCodes = ["manual_card"] as const;

export const forecastRisks = ["below_zero", "below_buffer"] as const;

const seriesSchema = z.object({
  known: z.array(amountSchema).length(forecastDayCount),
  estimated: z.array(amountSchema).length(forecastDayCount),
});

const pointSchema = z.object({
  date: isoDateSchema,
  amount: amountSchema,
});

const monthFlowSchema = z.object({
  month: z.string().refine(isMonthKey),
  income: amountSchema,
  spending: amountSchema,
});

export const forecastSchema = z.object({
  asOf: isoDateSchema,
  dates: z.array(isoDateSchema).length(forecastDayCount),
  nextIncomeDate: isoDateSchema.nullable(),
  bufferAmount: z.number().int().min(0),
  safeToSpend: amountSchema,
  lowest: pointSchema,
  warnings: z.array(
    z.object({
      code: z.enum(forecastWarningCodes),
      accountId: z.uuid(),
    }),
  ),
  accounts: z.array(
    z.object({
      accountId: z.uuid(),
      known: z.array(amountSchema).length(forecastDayCount),
      estimated: z.array(amountSchema).length(forecastDayCount),
      lowest: pointSchema,
      risk: z.enum(forecastRisks).nullable(),
    }),
  ),
  total: seriesSchema,
  months: z.array(monthFlowSchema),
});

export type Forecast = z.infer<typeof forecastSchema>;
export type ForecastMonth = z.infer<typeof monthFlowSchema>;
export type ForecastWarningCode = (typeof forecastWarningCodes)[number];
export type ForecastRisk = (typeof forecastRisks)[number];

export type ForecastDelta = {
  date: string;
  accountId: string;
  amount: number;
  series: "known" | "estimated";
};

/** Income and spending of one forecast day. Spending is positive when money goes out. `bucketId` is the bucket of the flow, or null. */
export type ForecastFlow = {
  date: string;
  income: number;
  spending: number;
  bucketId: string | null;
};

export type ForecastCard = {
  accountId: string;
  paymentAccountId: string | null;
  policy: PaymentPolicy;
  fixedPayment: number | null;
  paymentDay: number | null;
};

const riskKinds = new Set<AccountKind>(["chequing", "savings", "cash"]);

export type ForecastInput = {
  asOf: string;
  bufferAmount: number;
  nextIncomeDate: string | null;
  warnings: { code: ForecastWarningCode; accountId: string }[];
  accounts: { id: string; kind: AccountKind; balance: number }[];
  deltas: ForecastDelta[];
  flows: ForecastFlow[];
  cards: ForecastCard[];
};

export function forecastDates(asOf: string): string[] {
  const start = Temporal.PlainDate.from(asOf);
  return Array.from({ length: forecastDayCount }, (_, index) => start.add({ days: index }).toString());
}

export function monthEnd(asOf: string): string {
  const date = Temporal.PlainDate.from(asOf);
  return date.with({ day: date.daysInMonth }).toString();
}

/** `step` is the milliunits in one minor unit of the book currency. The result is a whole number of minor units. */
export function unbucketedMonthly(months: readonly string[], lines: readonly { month: string; amount: number }[], step: number): number {
  if (months.length === 0 || lines.length === 0) {
    return 0;
  }
  const medianLine = medianOf(lines.map((line) => line.amount));
  const limit = Math.abs(medianLine) * 3;
  const totals = new Map<string, number>(months.map((month) => [month, 0]));
  for (const line of lines) {
    if (Math.abs(line.amount) > limit) {
      continue;
    }
    const current = totals.get(line.month);
    if (current === undefined) {
      continue;
    }
    totals.set(line.month, current + line.amount);
  }
  const median = medianAmount(months.map((month) => totals.get(month) ?? 0), step);
  return median < 0 ? -median : 0;
}

/** The daily deltas of each monthly spending item. Each delta keeps the bucket of its item. */
export function spendDeltas(
  dates: readonly string[],
  items: readonly { accountId: string; monthly: number; bucketId: string | null }[],
  step: number,
): (ForecastDelta & { bucketId: string | null })[] {
  const shares = new Map<string, number[]>();
  const deltas: (ForecastDelta & { bucketId: string | null })[] = [];
  for (const item of items) {
    if (item.monthly <= 0) {
      continue;
    }
    for (const date of dates) {
      const day = Temporal.PlainDate.from(date);
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
      deltas.push({ date, accountId: item.accountId, amount: -share, series: "estimated", bucketId: item.bucketId });
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

/** The usual day of the month of the payments into a card in the last 12 months before `asOf`. */
export function cardPaymentDay(paymentDates: readonly string[], asOf: string): number | null {
  const from = Temporal.PlainDate.from(asOf).subtract({ months: 12 }).toString();
  const days = paymentDates
    .filter((date) => date > from && date <= asOf)
    .map((date) => Temporal.PlainDate.from(date).day);
  return days.length === 0 ? null : medianOf(days);
}

function isPaymentDay(date: string, paymentDay: number) {
  const plain = Temporal.PlainDate.from(date);
  return plain.day === Math.min(paymentDay, plain.daysInMonth);
}

function lowestPoint(dates: readonly string[], values: readonly number[]) {
  let index = 0;
  for (let cursor = 1; cursor < values.length; cursor += 1) {
    if ((values[cursor] ?? 0) < (values[index] ?? 0)) {
      index = cursor;
    }
  }
  return { date: dates[index] ?? dates[0] ?? "", amount: values[index] ?? 0 };
}

function addTo(bucket: Map<string, number>, accountId: string, amount: number) {
  bucket.set(accountId, (bucket.get(accountId) ?? 0) + amount);
}

function pay(series: Map<string, number>, cardId: string, paymentAccountId: string | null, scheduled: number) {
  if (scheduled <= 0 || paymentAccountId === null || !series.has(cardId) || !series.has(paymentAccountId)) {
    return;
  }
  const balance = series.get(cardId) ?? 0;
  const amount = Math.min(scheduled, Math.max(0, -balance));
  if (amount === 0) {
    return;
  }
  series.set(cardId, balance + amount);
  series.set(paymentAccountId, (series.get(paymentAccountId) ?? 0) - amount);
}

function applyDay(series: Map<string, number>, deltas: Map<string, number>) {
  for (const [accountId, amount] of deltas) {
    if (!series.has(accountId)) {
      continue;
    }
    series.set(accountId, (series.get(accountId) ?? 0) + amount);
  }
}

export function buildForecast(input: ForecastInput): Forecast {
  const dates = forecastDates(input.asOf);
  const indexOf = new Map(dates.map((date, index) => [date, index]));
  const ids = input.accounts.map((account) => account.id);
  const kinds = new Map(input.accounts.map((account) => [account.id, account.kind]));
  const known = new Map(input.accounts.map((account) => [account.id, account.balance]));
  const estimated = new Map(known);
  const knownDeltas = Array.from({ length: forecastDayCount }, () => new Map<string, number>());
  const estimatedDeltas = Array.from({ length: forecastDayCount }, () => new Map<string, number>());
  for (const delta of input.deltas) {
    const index = indexOf.get(delta.date);
    if (index === undefined) {
      continue;
    }
    addTo(delta.series === "known" ? knownDeltas[index]! : estimatedDeltas[index]!, delta.accountId, delta.amount);
  }

  const knownSeries = new Map<string, number[]>(ids.map((id) => [id, []]));
  const estimatedSeries = new Map<string, number[]>(ids.map((id) => [id, []]));
  const cutOff = new Map(input.cards.map((card) => [card.accountId, Math.max(0, -(known.get(card.accountId) ?? 0))]));
  const paid = new Set<string>();
  for (let day = 0; day < dates.length; day += 1) {
    const date = dates[day] ?? "";
    applyDay(known, knownDeltas[day] ?? new Map());
    applyDay(estimated, knownDeltas[day] ?? new Map());
    applyDay(estimated, estimatedDeltas[day] ?? new Map());
    for (const card of input.cards) {
      if (card.policy === "manual" || card.paymentDay === null || !isPaymentDay(date, card.paymentDay)) {
        continue;
      }
      const owed = cutOff.get(card.accountId) ?? 0;
      const scheduled = card.policy === "fixed" ? (card.fixedPayment ?? 0) : owed;
      if (!paid.has(card.accountId)) {
        pay(known, card.accountId, card.paymentAccountId, scheduled);
        paid.add(card.accountId);
      }
      pay(estimated, card.accountId, card.paymentAccountId, scheduled);
      cutOff.set(card.accountId, Math.max(0, -(estimated.get(card.accountId) ?? 0)));
    }
    for (const id of ids) {
      knownSeries.get(id)?.push(known.get(id) ?? 0);
      estimatedSeries.get(id)?.push(estimated.get(id) ?? 0);
    }
  }

  const totalKnown = dates.map((_, day) => ids.reduce((sum, id) => sum + (knownSeries.get(id)?.[day] ?? 0), 0));
  const totalEstimated = dates.map((_, day) => ids.reduce((sum, id) => sum + (estimatedSeries.get(id)?.[day] ?? 0), 0));
  const windowEnd = input.nextIncomeDate ?? Temporal.PlainDate.from(input.asOf).add({ days: noPaydayWindowDays }).toString();
  let floor = totalEstimated[0] ?? 0;
  for (let day = 0; day < dates.length; day += 1) {
    if ((dates[day] ?? "") >= windowEnd) {
      break;
    }
    const value = totalEstimated[day] ?? 0;
    if (value < floor) {
      floor = value;
    }
  }

  return {
    asOf: input.asOf,
    dates,
    nextIncomeDate: input.nextIncomeDate,
    bufferAmount: input.bufferAmount,
    safeToSpend: floor - input.bufferAmount,
    lowest: lowestPoint(dates, totalEstimated),
    warnings: input.warnings,
    accounts: ids.map((id) => {
      const estimatedValues = estimatedSeries.get(id) ?? [];
      const low = estimatedValues.length === 0 ? 0 : Math.min(...estimatedValues);
      const kind = kinds.get(id);
      let risk: ForecastRisk | null = null;
      if (kind && riskKinds.has(kind)) {
        if (low < 0) {
          risk = "below_zero";
        } else if (low < input.bufferAmount) {
          risk = "below_buffer";
        }
      }
      return {
        accountId: id,
        known: knownSeries.get(id) ?? [],
        estimated: estimatedValues,
        lowest: lowestPoint(dates, estimatedValues),
        risk,
      };
    }),
    total: { known: totalKnown, estimated: totalEstimated },
    months: forecastMonths(dates, input.flows),
  };
}
