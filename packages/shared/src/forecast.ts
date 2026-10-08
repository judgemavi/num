import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { PaymentPolicy } from "./account";
import { cardStatements } from "./card-statement";
import { isoDateSchema } from "./date";
import { billReserveDays } from "./funding";
import { medianMinor } from "./recurring-calc";

export const forecastDayCount = 90;

const centsSchema = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);

export const forecastWarningCodes = ["manual_card", "no_payment_account"] as const;

export const forecastRisks = ["below_zero", "below_buffer"] as const;

const seriesSchema = z.object({
  known: z.array(centsSchema).length(forecastDayCount),
  estimated: z.array(centsSchema).length(forecastDayCount),
});

const pointSchema = z.object({
  date: isoDateSchema,
  amount: centsSchema,
});

export const forecastSchema = z.object({
  asOf: isoDateSchema,
  dates: z.array(isoDateSchema).length(forecastDayCount),
  nextIncomeDate: isoDateSchema.nullable(),
  bufferAmount: z.number().int().min(0),
  safeToSpend: centsSchema,
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
      known: z.array(centsSchema).length(forecastDayCount),
      estimated: z.array(centsSchema).length(forecastDayCount),
      lowest: pointSchema,
      risk: z.enum(forecastRisks).nullable(),
    }),
  ),
  total: seriesSchema,
});

export type Forecast = z.infer<typeof forecastSchema>;
export type ForecastWarningCode = (typeof forecastWarningCodes)[number];
export type ForecastRisk = (typeof forecastRisks)[number];

export type ForecastDelta = {
  date: string;
  accountId: string;
  amount: number;
  series: "known" | "estimated";
};

export type ForecastCard = {
  accountId: string;
  paymentAccountId: string | null;
  policy: PaymentPolicy;
  fixedPayment: number | null;
  knownPayment: { date: string; amount: number } | null;
  estimatedStatements: { date: string; dueDate: string }[];
};

export type ForecastInput = {
  asOf: string;
  bufferAmount: number;
  nextIncomeDate: string | null;
  warnings: { code: ForecastWarningCode; accountId: string }[];
  accounts: { id: string; balance: number }[];
  deltas: ForecastDelta[];
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

export function unbucketedMonthly(months: readonly string[], lines: readonly { month: string; amount: number }[]): number {
  if (months.length === 0 || lines.length === 0) {
    return 0;
  }
  const medianLine = medianMinor(lines.map((line) => line.amount));
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
  const median = medianMinor(months.map((month) => totals.get(month) ?? 0));
  return median < 0 ? -median : 0;
}

export function spendDeltas(dates: readonly string[], items: readonly { accountId: string; monthly: number }[]): ForecastDelta[] {
  const shares = new Map<string, number[]>();
  const deltas: ForecastDelta[] = [];
  for (const item of items) {
    if (item.monthly <= 0) {
      continue;
    }
    for (const date of dates) {
      const day = Temporal.PlainDate.from(date);
      const key = `${item.monthly}|${day.year}-${day.month}`;
      let monthShares = shares.get(key);
      if (!monthShares) {
        monthShares = dailyShares(item.monthly, day.daysInMonth);
        shares.set(key, monthShares);
      }
      const share = monthShares[day.day - 1] ?? 0;
      if (share === 0) {
        continue;
      }
      deltas.push({ date, accountId: item.accountId, amount: -share, series: "estimated" });
    }
  }
  return deltas;
}

function dailyShares(total: number, daysInMonth: number): number[] {
  const base = Math.floor(total / daysInMonth);
  const extra = total % daysInMonth;
  return Array.from({ length: daysInMonth }, (_, index) => (index < extra ? base + 1 : base));
}

export function cardForecastSchedule(input: {
  statements: readonly { date: string; balance: number }[];
  paymentDates: readonly string[];
  asOf: string;
  horizonEnd: string;
  policy: PaymentPolicy;
  fixedPayment: number | null;
}): { knownPayment: { date: string; amount: number } | null; estimatedStatements: { date: string; dueDate: string }[] } {
  const none = { knownPayment: null, estimatedStatements: [] as { date: string; dueDate: string }[] };
  if (input.policy === "manual" || input.statements.length === 0) {
    return none;
  }
  const listed = cardStatements({
    statements: input.statements.map((statement) => ({ date: statement.date })),
    paymentDates: input.paymentDates,
  });
  const actual = listed.filter((item) => item.code === "statement");
  const latest = actual[actual.length - 1];
  if (!latest) {
    return none;
  }
  const balance = [...input.statements].reverse().find((statement) => statement.date === latest.date)?.balance ?? 0;
  const gap = Temporal.PlainDate.from(latest.date).until(Temporal.PlainDate.from(latest.dueDate), { largestUnit: "day" }).days;
  const paid = input.paymentDates.some((date) => date > latest.date && date <= input.asOf);
  let knownPayment: { date: string; amount: number } | null = null;
  if (!paid && latest.dueDate >= input.asOf && latest.dueDate <= input.horizonEnd) {
    const amount = input.policy === "fixed" ? (input.fixedPayment ?? 0) : Math.max(0, -balance);
    if (amount > 0) {
      knownPayment = { date: latest.dueDate, amount };
    }
  }
  const estimatedStatements: { date: string; dueDate: string }[] = [];
  let cursor = Temporal.PlainDate.from(latest.date);
  for (let step = 0; step < 6; step += 1) {
    cursor = cursor.add({ months: 1 });
    const dueDate = cursor.add({ days: gap }).toString();
    const date = cursor.toString();
    if (date > input.horizonEnd && dueDate > input.horizonEnd) {
      break;
    }
    estimatedStatements.push({ date, dueDate });
  }
  return { knownPayment, estimatedStatements };
}

function lowestPoint(dates: readonly string[], values: readonly number[]): { date: string; amount: number } {
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
  if (scheduled <= 0 || paymentAccountId === null) {
    return;
  }
  const balance = series.get(cardId);
  if (balance === undefined) {
    return;
  }
  const amount = Math.min(scheduled, Math.max(0, -balance));
  if (amount === 0) {
    return;
  }
  series.set(cardId, balance + amount);
  if (series.has(paymentAccountId)) {
    series.set(paymentAccountId, (series.get(paymentAccountId) ?? 0) - amount);
  }
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
  const captures = new Map<string, number>();

  for (let day = 0; day < dates.length; day += 1) {
    const date = dates[day] ?? "";
    applyDay(known, knownDeltas[day] ?? new Map());
    applyDay(estimated, knownDeltas[day] ?? new Map());
    applyDay(estimated, estimatedDeltas[day] ?? new Map());
    for (const card of input.cards) {
      if (card.knownPayment?.date === date) {
        pay(known, card.accountId, card.paymentAccountId, card.knownPayment.amount);
        pay(estimated, card.accountId, card.paymentAccountId, card.knownPayment.amount);
      }
      for (const statement of card.estimatedStatements) {
        if (statement.date === date) {
          captures.set(`${card.accountId}|${statement.date}`, estimated.get(card.accountId) ?? 0);
        }
      }
      for (const statement of card.estimatedStatements) {
        if (statement.dueDate !== date || card.policy === "manual") {
          continue;
        }
        const scheduled =
          card.policy === "fixed"
            ? (card.fixedPayment ?? 0)
            : Math.max(0, -(captures.get(`${card.accountId}|${statement.date}`) ?? 0));
        pay(estimated, card.accountId, card.paymentAccountId, scheduled);
      }
    }
    for (const id of ids) {
      knownSeries.get(id)?.push(known.get(id) ?? 0);
      estimatedSeries.get(id)?.push(estimated.get(id) ?? 0);
    }
  }

  const totalKnown = dates.map((_, day) => ids.reduce((sum, id) => sum + (knownSeries.get(id)?.[day] ?? 0), 0));
  const totalEstimated = dates.map((_, day) => ids.reduce((sum, id) => sum + (estimatedSeries.get(id)?.[day] ?? 0), 0));
  const windowEnd = input.nextIncomeDate ?? Temporal.PlainDate.from(input.asOf).add({ days: billReserveDays }).toString();
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
      const low = Math.min(...estimatedValues);
      let risk: ForecastRisk | null = null;
      if (low < 0) {
        risk = "below_zero";
      } else if (low < input.bufferAmount) {
        risk = "below_buffer";
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
  };
}
