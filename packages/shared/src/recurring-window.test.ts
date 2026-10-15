import { expect, test } from "bun:test";
import type { PlanSchedule } from "./recurring-calc";
import { isInboxMissed, missedCandidates, occurrenceWindow, windowEnded } from "./recurring-window";

const plan: PlanSchedule = { startDate: "2026-10-02", endDate: null, freq: "weekly", interval: 1, monthDay: null, businessDayShift: "none" };
const monthly: PlanSchedule = { ...plan, startDate: "2026-01-15", freq: "monthly", monthDay: 15 };

function range(schedule: PlanSchedule, index: number) {
  const window = occurrenceWindow(schedule, index);
  return [window.dueDate, window.start, window.end];
}

test("a window goes from the midpoint before the due date (included) to the midpoint after it (not included)", () => {
  // Weekly: about ±3 days. Every 2 weeks: about ±7 days.
  expect(range(plan, 1)).toEqual(["2026-10-09", "2026-10-06", "2026-10-13"]);
  expect(range({ ...plan, interval: 2 }, 1)).toEqual(["2026-10-16", "2026-10-09", "2026-10-23"]);
  // Monthly: about ±15 days. 30 days before, 31 days after.
  expect(range(monthly, 9)).toEqual(["2026-10-15", "2026-09-30", "2026-10-31"]);
  // Yearly: about ±6 months.
  expect(range({ ...plan, startDate: "2026-03-10", freq: "yearly" }, 1)).toEqual(["2027-03-10", "2026-09-09", "2027-09-09"]);
});

test("the windows of a schedule touch and do not overlap", () => {
  for (const schedule of [plan, { ...plan, interval: 2 }, monthly, { ...plan, freq: "yearly" as const }]) {
    for (let index = 0; index < 30; index += 1) {
      expect(occurrenceWindow(schedule, index).end).toBe(occurrenceWindow(schedule, index + 1).start);
    }
  }
});

test("a window uses the due dates after the business-day shift", () => {
  const shifted: PlanSchedule = { ...monthly, startDate: "2026-01-04", monthDay: 4, businessDayShift: "next" };
  // 2026-10-04 is a Sunday: due 2026-10-05. 2026-09-04 and 2026-11-04 are weekdays.
  expect(range(shifted, 9)).toEqual(["2026-10-05", "2026-09-20", "2026-10-20"]);
});

test("the first occurrence starts as far before its due date as its window ends after it", () => {
  expect(range(plan, 0)).toEqual(["2026-10-02", "2026-09-29", "2026-10-06"]);
  expect(range(monthly, 0)).toEqual(["2026-01-15", "2025-12-31", "2026-01-31"]);
  expect(range({ ...plan, startDate: "2026-03-10", freq: "yearly" }, 0)).toEqual(["2026-03-10", "2025-09-09", "2026-09-09"]);
});

test("an occurrence is missed only after its window ends, and Home shows only the last 35 days", () => {
  const october = occurrenceWindow(monthly, 9);
  expect(windowEnded(october, "2026-10-30")).toBe(false);
  expect(windowEnded(october, "2026-10-31")).toBe(true);
  expect(isInboxMissed(october, "2026-10-20")).toBe(false);
  expect(isInboxMissed(october, "2026-10-31")).toBe(true);
  expect(isInboxMissed(october, "2026-11-19")).toBe(true);
  expect(isInboxMissed(october, "2026-11-20")).toBe(false);
  expect(missedCandidates(monthly, "2026-10-31").map((window) => window.dueDate)).toEqual(["2026-10-15"]);
  expect(missedCandidates(monthly, "2026-10-30").map((window) => window.dueDate)).toEqual([]);
});
