import { Temporal, type InsightFlow, type InsightTimeline, type InsightTimelineMonth } from "@num/shared";

export const chart = { width: 1000, height: 320, left: 76, right: 76, top: 28, bottom: 40 } as const;

const plotWidth = chart.width - chart.left - chart.right;
const plotHeight = chart.height - chart.top - chart.bottom;

export type Point = { date: string; amount: number };

function positive(value: number): number {
  return value > 0 ? value : 0;
}

/** Rounds away from zero to two significant digits, so the axis labels are short. */
function roundOut(value: number): number {
  if (value === 0) {
    return 0;
  }
  const step = 10 ** Math.max(0, Math.floor(Math.log10(Math.abs(value))) - 1);
  return value > 0 ? Math.ceil(value / step) * step : Math.floor(value / step) * step;
}

export function flowTotal(month: InsightTimelineMonth, key: keyof InsightFlow): number {
  return positive(month.actual?.[key] ?? 0) + positive(month.forecast?.[key] ?? 0);
}

export function timelineScale(timeline: InsightTimeline) {
  const months = timeline.months;
  const band = plotWidth / Math.max(months.length, 1);
  const index = new Map(months.map((item, position) => [item.month, position]));
  const barPeak = Math.max(1, ...months.flatMap((item) => [flowTotal(item, "income"), flowTotal(item, "spending")]));
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

  function bandX(month: number): number {
    return chart.left + band * month;
  }

  function barY(value: number): number {
    return chart.top + plotHeight * (1 - value / barTop);
  }

  function balanceY(value: number): number {
    return chart.top + plotHeight * (1 - (value - balanceBottom) / Math.max(balanceTop - balanceBottom, 1));
  }

  function dateX(date: string): number | null {
    const month = index.get(date.slice(0, 7));
    if (month === undefined) {
      return null;
    }
    const day = Temporal.PlainDate.from(date);
    return bandX(month) + (band * (day.day - 0.5)) / day.daysInMonth;
  }

  function linePath(points: readonly Point[]): string {
    let path = "";
    for (const point of points) {
      const x = dateX(point.date);
      if (x === null) {
        continue;
      }
      path += `${path === "" ? "M" : "L"}${x.toFixed(1)} ${balanceY(point.amount).toFixed(1)}`;
    }
    return path;
  }

  return {
    band,
    bandX,
    barY,
    balanceY,
    dateX,
    linePath,
    barTicks: [0, Math.round(barTop / 2), barTop],
    balanceTicks: [balanceBottom, Math.round((balanceBottom + balanceTop) / 2), balanceTop],
    hasBalance: balanceValues.length > 0,
    bottom: chart.height - chart.bottom,
  };
}

export function forecastPoints(dates: readonly string[], amounts: readonly number[]): Point[] {
  return dates.map((date, position) => ({ date, amount: amounts[position] ?? 0 }));
}

export function shortMonth(month: string): string {
  return Temporal.PlainDate.from(`${month}-01`).toLocaleString(undefined, { month: "short", year: "2-digit" });
}

export function shortDay(date: string): string {
  return Temporal.PlainDate.from(date).toLocaleString(undefined, { month: "short", day: "numeric" });
}
