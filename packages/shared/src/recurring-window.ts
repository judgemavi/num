import { Temporal } from "temporal-polyfill";
import { indexedOccurrences, occurrenceAt, type OccurrenceDate, type PlanSchedule } from "./recurring-calc";

/**
 * The period of an occurrence: from `start` (included) to `end` (not included). The start is the midpoint between the
 * due date of the previous occurrence and this due date. The end is the midpoint between this due date and the next
 * due date. A date at a midpoint goes to the later occurrence. The due dates are the dates after the business-day shift.
 */
export type OccurrenceWindow = OccurrenceDate & { start: string; end: string };

/** The days of Home "Missed": only occurrences due in the last 35 days. */
const missedDays = 35;

function daysBetween(left: string, right: string) {
  return Temporal.PlainDate.from(left).until(Temporal.PlainDate.from(right), { largestUnit: "day" }).days;
}

/** The date `count` intervals of the schedule after `date` (before it when `count` is less than 0). */
export function addPeriods(plan: PlanSchedule, date: string, count: number): string {
  const units = plan.interval * count;
  const day = Temporal.PlainDate.from(date);
  if (plan.freq === "weekly") {
    return day.add({ weeks: units }).toString();
  }
  return (plan.freq === "monthly" ? day.add({ months: units }) : day.add({ years: units })).toString();
}

/**
 * The window of occurrence `index`. The first occurrence has no previous one: its window starts at the same distance
 * before the due date as the window ends after it. The end date of the schedule does not change a window.
 */
export function occurrenceWindow(plan: PlanSchedule, index: number): OccurrenceWindow {
  const here = occurrenceAt(plan, index);
  const after = daysBetween(here.dueDate, occurrenceAt(plan, index + 1).dueDate);
  const before = index > 0 ? daysBetween(occurrenceAt(plan, index - 1).dueDate, here.dueDate) : after;
  const due = Temporal.PlainDate.from(here.dueDate);
  return {
    ...here,
    start: due.subtract({ days: Math.floor(before / 2) }).toString(),
    end: due.add({ days: Math.ceil(after / 2) }).toString(),
  };
}

/** The windows of the occurrences due from `from` to `to`. */
export function occurrenceWindows(plan: PlanSchedule, to: string, from?: string): OccurrenceWindow[] {
  return indexedOccurrences(plan, to, from).map((item) => occurrenceWindow(plan, item.index));
}

/** The window has ended when its end is on or before `asOf`. */
export function windowEnded(window: { end: string }, asOf: string): boolean {
  return window.end <= asOf;
}

/** Home shows a missed occurrence when its window has ended and it is due in the last 35 days. */
export function isInboxMissed(window: OccurrenceWindow, asOf: string): boolean {
  const earliest = Temporal.PlainDate.from(asOf).subtract({ days: missedDays }).toString();
  return windowEnded(window, asOf) && window.dueDate >= earliest;
}

/** The windows of the occurrences that can be missed on `asOf`: due in the last 35 days. */
export function missedCandidates(plan: PlanSchedule, asOf: string): OccurrenceWindow[] {
  const earliest = Temporal.PlainDate.from(asOf).subtract({ days: missedDays }).toString();
  return occurrenceWindows(plan, asOf, earliest).filter((window) => isInboxMissed(window, asOf));
}
