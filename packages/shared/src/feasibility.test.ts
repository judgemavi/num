import { expect, test } from "bun:test";
import { buildFeasibility, type FeasibilityBucket, type FeasibilitySchedule } from "./feasibility";
import type { PlanSchedule } from "./recurring-calc";

function schedule(startDate: string, freq: PlanSchedule["freq"], interval: number, monthDay: number | null = null): PlanSchedule {
  return { startDate, endDate: null, freq, interval, monthDay, businessDayShift: "none" };
}

function income(safe: number, plan: PlanSchedule): FeasibilitySchedule {
  return { kind: "income", safe, schedule: plan };
}

function bill(safe: number, plan: PlanSchedule): FeasibilitySchedule {
  return { kind: "commitment", safe, schedule: plan };
}

const none = { refillTo: null, amount: null, dueDate: null, repeat: null, target: null, targetDate: null, fixedAmount: null } as const;

function bucket(id: string, fields: Partial<FeasibilityBucket> & Pick<FeasibilityBucket, "kind">): FeasibilityBucket {
  return { id, name: id, balance: 0, paused: false, startDate: "2000-01-01", commitment: null, ...none, ...fields };
}

function goal(id: string, target: number, targetDate: string | null, fixedAmount: number | null) {
  return bucket(id, { kind: "goal", target, targetDate, fixedAmount });
}

const biweekly = schedule("2026-01-02", "weekly", 2);

test("a shortfall shows a later date that fits and the amount to cut elsewhere", () => {
  const result = buildFeasibility({
    month: "2026-02",
    step: 10,
    schedules: [income(1_000_000, biweekly), bill(600_000, schedule("2026-02-15", "monthly", 1, 15))],
    buckets: [
      bucket("tax", { kind: "sinking", amount: 1_200_000, dueDate: "2026-02-28", repeat: "none" }),
      goal("steady", 500_000, null, 200_000),
      bucket("food", { kind: "spending", refillTo: 400_000 }),
    ],
  });
  expect(result).toMatchObject({ income: 2_166_670, commitments: 600_000, refills: 400_000, surplus: 1_166_670, need: 1_400_000, shortfall: 233_330 });
  expect(result?.buckets.find((item) => item.bucketId === "tax")).toMatchObject({ monthly: 1_200_000, laterDate: "2026-04-01" });
});

test("the monthly surplus does not subtract an emergency amount", () => {
  const result = buildFeasibility({
    month: "2026-02",
    step: 10,
    schedules: [income(1_000_000, biweekly)],
    buckets: [bucket("fund", { kind: "emergency", target: 2_600_000 })],
  });
  expect(result).toMatchObject({ income: 2_166_670, surplus: 2_166_670, need: 0, shortfall: 0 });
});

test("a book with no income has no feasibility", () => {
  expect(buildFeasibility({ month: "2026-02", step: 10, schedules: [bill(1_000, biweekly)], buckets: [] })).toBeNull();
});

test("goals that are short together each get a later date from a share of the surplus", () => {
  const result = buildFeasibility({
    month: "2026-02",
    step: 10,
    schedules: [income(100_000, biweekly)],
    buckets: [goal("north", 800_000, "2026-02-28", null), goal("south", 800_000, "2026-02-28", null)],
  });
  expect(result?.surplus).toBe(216_670);
  expect(result?.shortfall).toBe(1_383_330);
  const dates = result?.buckets.map((item) => item.laterDate) ?? [];
  expect(dates.every((date) => date !== null)).toBe(true);
  expect(new Set(dates).size).toBe(1);
});

test("the monthly amount of a goal is a whole number of the currency's minor unit", () => {
  const need = (step: number) =>
    buildFeasibility({ month: "2026-01", step, schedules: [income(3_000_000, biweekly)], buckets: [goal("trip", 10_000, "2026-04-15", null)] })?.need;
  expect(need(10)).toBe(3_340);
  expect(need(1000)).toBe(4_000);
});

test("a paused goal needs nothing", () => {
  const result = buildFeasibility({
    month: "2026-01",
    step: 10,
    schedules: [income(3_000_000, biweekly)],
    buckets: [{ ...goal("trip", 10_000, "2026-04-15", null), paused: true }],
  });
  expect(result).toMatchObject({ need: 0, buckets: [] });
});

test("income and bills are the yearly amount divided by 12, the same in each month", () => {
  const schedules = [income(1_000, schedule("2026-01-02", "weekly", 1)), bill(600_000, schedule("2026-01-15", "monthly", 1, 15)), bill(120_000, schedule("2026-03-10", "yearly", 1, 10))];
  const january = buildFeasibility({ month: "2026-01", step: 10, schedules, buckets: [] });
  const february = buildFeasibility({ month: "2026-02", step: 10, schedules, buckets: [] });
  expect(january?.income).toBe(4_330);
  expect(february?.income).toBe(4_330);
  expect(january?.commitments).toBe(610_000);
  expect(february?.commitments).toBe(610_000);
});
