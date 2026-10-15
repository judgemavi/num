import { Temporal, type InsightFlow, type InsightTimeline, type InsightTimelineMonth } from "@num/shared";
import { formatMoney } from "@/money";

function positive(value: number | undefined) {
  return value !== undefined && value > 0 ? value : 0;
}

/** Rounds away from zero to two significant digits, so the axis labels are short. */
function roundOut(value: number) {
  if (value === 0) {
    return 0;
  }
  const step = 10 ** Math.max(0, Math.floor(Math.log10(Math.abs(value))) - 1);
  return value > 0 ? Math.ceil(value / step) * step : Math.floor(value / step) * step;
}

function flowTotal(month: InsightTimelineMonth, key: keyof InsightFlow): number {
  return positive(month.actual?.[key]) + positive(month.forecast?.[key]);
}

/** The last forecast day when the forecast stops inside a month. */
function partialEnd(timeline: InsightTimeline) {
  const last = timeline.forecast?.dates.at(-1);
  if (!last) {
    return null;
  }
  const day = Temporal.PlainDate.from(last);
  return day.day < day.daysInMonth ? last : null;
}

/**
 * One row for each month: the actual part and the forecast part of each bar. `end` is the last forecast day when the
 * forecast stops inside this month. Then the forecast part of the bar has a dashed outline.
 */
export function monthRows(timeline: InsightTimeline) {
  const end = partialEnd(timeline);
  return timeline.months.map((item) => ({
    month: item.month,
    item,
    end: end !== null && end.startsWith(item.month) ? end : null,
    incomeActual: positive(item.actual?.income),
    incomeForecast: positive(item.forecast?.income),
    spendingActual: positive(item.actual?.spending),
    spendingForecast: positive(item.forecast?.spending),
  }));
}

export type MonthRow = ReturnType<typeof monthRows>[number];

/** The place of a date on the day axis. Month number n of the timeline goes from n to n + 1. */
export function dayPosition(months: readonly InsightTimelineMonth[], date: string): number | null {
  const index = months.findIndex((item) => item.month === date.slice(0, 7));
  if (index < 0) {
    return null;
  }
  const day = Temporal.PlainDate.from(date);
  return index + (day.day - 0.5) / day.daysInMonth;
}

function linePoints(months: readonly InsightTimelineMonth[], dates: readonly string[], amounts: readonly number[]) {
  return dates.flatMap((date, position) => {
    const x = dayPosition(months, date);
    return x === null ? [] : [{ x, amount: amounts[position] ?? 0 }];
  });
}

/** The points of the balance line, of the estimated forecast line and of the known-only forecast line. */
export function balanceLines(timeline: InsightTimeline) {
  const { months, balances, forecast } = timeline;
  return {
    actual: linePoints(
      months,
      balances.map((point) => point.date),
      balances.map((point) => point.amount),
    ),
    estimated: forecast ? linePoints(months, forecast.dates, forecast.estimated) : [],
    known: forecast ? linePoints(months, forecast.dates, forecast.known) : [],
  };
}

/** The ranges and the three ticks of the bar axis and of the balance axis. */
export function timelineRanges(timeline: InsightTimeline) {
  const barPeak = Math.max(1, ...timeline.months.flatMap((item) => [flowTotal(item, "income"), flowTotal(item, "spending")]));
  const barTop = roundOut(Math.ceil(barPeak * 1.1));
  const balanceValues = [
    ...timeline.balances.map((point) => point.amount),
    ...(timeline.forecast?.estimated ?? []),
    ...(timeline.forecast?.known ?? []),
  ];
  const high = Math.max(0, ...balanceValues);
  const low = Math.min(0, ...balanceValues);
  const pad = Math.max(Math.round((high - low) * 0.08), 1);
  const balanceTop = roundOut(high + pad);
  const balanceBottom = low < 0 ? roundOut(low - pad) : 0;
  return {
    barTicks: [0, Math.round(barTop / 2), barTop],
    balanceTicks: [balanceBottom, Math.round((balanceBottom + balanceTop) / 2), balanceTop],
    hasBalance: balanceValues.length > 0,
    peakSpending: Math.max(0, ...timeline.months.map((item) => flowTotal(item, "spending"))),
  };
}

export function shortMonth(month: string): string {
  return Temporal.PlainDate.from(`${month}-01`).toLocaleString(undefined, { month: "short", year: "2-digit" });
}

function shortDay(date: string): string {
  return Temporal.PlainDate.from(date).toLocaleString(undefined, { month: "short", day: "numeric" });
}

export type BarKind = { key: "income" | "spending"; label: string };

/** The text of one bar of a month: the actual amount and the forecast amount. */
export function flowText(currency: string, kind: BarKind, row: MonthRow) {
  const parts: string[] = [];
  const actual = row.item.actual?.[kind.key];
  const planned = row.item.forecast?.[kind.key];
  if (actual !== undefined) {
    parts.push(formatMoney(currency, actual));
  }
  if (planned !== undefined) {
    parts.push(`${formatMoney(currency, planned)} forecast${row.end ? ` to ${shortDay(row.end)}` : ""}`);
  }
  return `${kind.label} ${parts.join(" + ")}`;
}
