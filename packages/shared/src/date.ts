import { Temporal } from "temporal-polyfill";
import { z } from "zod";

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  try {
    return Temporal.PlainDate.from(value).toString() === value;
  } catch (error) {
    if (error instanceof RangeError) {
      return false;
    }
    throw error;
  }
}

export const isoDateSchema = z.string().refine(isIsoDate);

export const asOfQuerySchema = z.object({
  asOf: isoDateSchema,
});

/** Signed calendar days from the first date to the second date. */
export function daysBetween(from: string | Temporal.PlainDate, to: string | Temporal.PlainDate): number {
  return Temporal.PlainDate.from(from).until(Temporal.PlainDate.from(to), { largestUnit: "day" }).days;
}

export function dayDistance(from: string, to: string): number {
  return Math.abs(daysBetween(from, to));
}

export function addDays(iso: string, days: number): string {
  return Temporal.PlainDate.from(iso).add({ days }).toString();
}

export function dayBefore(iso: string): string {
  return addDays(iso, -1);
}

/** The first day of an ISO month or date. */
export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** -1 means the last day of the month. Other days stop at the last day. */
export function clampDay(month: Temporal.PlainDate, day: number): Temporal.PlainDate {
  return month.with({ day: day === -1 ? month.daysInMonth : Math.min(day, month.daysInMonth) });
}
