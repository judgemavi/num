import { expect, test } from "bun:test";
import { buildMonthPlan, type MonthPlanBucketSource, type MonthPlanLink, type MonthPlanSource } from "./month-plan";
import type { PlanSchedule } from "./recurring-calc";

function schedule(startDate: string, freq: PlanSchedule["freq"], interval: number, monthDay: number | null = null): PlanSchedule {
  return { startDate, endDate: null, freq, interval, monthDay, businessDayShift: "none" };
}

function income(id: string, amount: number, plan: PlanSchedule, fundsBuckets = true, amountMode: "fixed" | "variable" = "fixed"): MonthPlanSource {
  return {
    id,
    name: id,
    kind: "income",
    amountMode,
    expectedAmount: amount,
    fundsBuckets,
    active: true,
    archived: false,
    schedule: plan,
  };
}

function bill(id: string, amount: number, plan: PlanSchedule, amountMode: "fixed" | "variable" = "fixed"): MonthPlanSource {
  return {
    id,
    name: id,
    kind: "bill",
    amountMode,
    expectedAmount: -Math.abs(amount),
    fundsBuckets: false,
    active: true,
    archived: false,
    schedule: plan,
  };
}

function goal(id: string, target: number, targetDate: string | null, fixedAmount: number | null, balance = 0): MonthPlanBucketSource {
  return {
    id,
    name: id,
    kind: "goal",
    priority: 1,
    color: "lilac",
    archived: false,
    balance,
    refillTo: null,
    amount: null,
    dueDate: null,
    target,
    targetDate,
    fixedAmount,
    actualFunded: 0,
  };
}

const biweekly = schedule("2026-01-02", "weekly", 2);

test("monthly totals count weekly, biweekly and monthly occurrences, including a 3-paycheck month", () => {
  const january = buildMonthPlan({
    month: "2026-01",
    asOf: "2026-01-15",
    links: [],
    buckets: [goal("save", 1_000, null, 10)],
    plans: [
      income("week", 100, schedule("2026-01-02", "weekly", 1)),
      income("two-weeks", 100, biweekly),
      income("month", 100, schedule("2026-01-15", "monthly", 1, 15)),
      income("other", 50, schedule("2026-01-20", "monthly", 1, 20), false),
    ],
  });
  expect(january.paycheckCount).toBe(5 + 3 + 1);
  expect(january.income.planned).toBe(100 * 5 + 100 * 3 + 100 + 50);
  expect(january.funding.items.find((item) => item.bucketId === "save")).toMatchObject({ perPaycheck: 10, paychecks: 9, planned: 90 });

  const february = buildMonthPlan({
    month: "2026-02",
    asOf: "2026-02-01",
    links: [],
    buckets: [],
    plans: [income("two-weeks", 100, biweekly)],
  });
  expect(february.paycheckCount).toBe(2);
  expect(february.income.planned).toBe(200);
});

test("variable income uses the median of the last 6, and the plan amount when fewer than 3 exist", () => {
  const links: MonthPlanLink[] = [
    { planId: "pay", dueDate: "2025-12-19", skipped: false, actual: 50 },
    { planId: "pay", dueDate: "2025-12-05", skipped: false, actual: 100 },
    { planId: "pay", dueDate: "2025-11-21", skipped: false, actual: 200 },
    { planId: "pay", dueDate: "2025-11-07", skipped: false, actual: 300 },
    { planId: "pay", dueDate: "2025-10-24", skipped: false, actual: 400 },
    { planId: "pay", dueDate: "2025-10-10", skipped: false, actual: 500 },
    { planId: "pay", dueDate: "2025-09-26", skipped: false, actual: 9_999 },
  ];
  const month = buildMonthPlan({
    month: "2026-01",
    asOf: "2026-01-15",
    links,
    buckets: [],
    plans: [income("pay", 1_000, biweekly, true, "variable")],
  });
  expect(month.income.planned).toBe(250 * 3);
  expect(month.feasibility?.expectedPaycheck).toBe(50);

  const few = buildMonthPlan({
    month: "2026-01",
    asOf: "2026-01-15",
    links: links.slice(0, 2),
    buckets: [],
    plans: [income("pay", 1_000, biweekly, true, "variable")],
  });
  expect(few.income.planned).toBe(1_000 * 3);

  const power = buildMonthPlan({
    month: "2026-02",
    asOf: "2026-02-01",
    links: [
      { planId: "power", dueDate: "2025-11-15", skipped: false, actual: -100 },
      { planId: "power", dueDate: "2025-12-15", skipped: false, actual: -300 },
      { planId: "power", dueDate: "2026-01-15", skipped: false, actual: -500 },
    ],
    buckets: [],
    plans: [income("pay", 10_000, biweekly), bill("power", 1_000, schedule("2026-02-15", "monthly", 1, 15), "variable")],
  });
  expect(power.bills.planned).toBe(300);
  expect(power.feasibility?.billsEach).toBe(250);
});

test("a shortfall shows a later date that fits and the amount to cut elsewhere", () => {
  const sinking: MonthPlanBucketSource = {
    id: "tax",
    name: "Tax",
    kind: "sinking",
    priority: 1,
    color: "sky",
    archived: false,
    balance: 0,
    refillTo: null,
    amount: 80_000,
    dueDate: "2026-02-28",
    target: null,
    targetDate: null,
    fixedAmount: null,
    actualFunded: 0,
  };
  const month = buildMonthPlan({
    month: "2026-02",
    asOf: "2026-02-01",
    links: [],
    plans: [
      income("pay", 100_000, biweekly),
      bill("rent", 60_000, schedule("2026-02-15", "monthly", 1, 15)),
    ],
    buckets: [
      sinking,
      goal("steady", 50_000, null, 20_000),
      {
        id: "food",
        name: "Food",
        kind: "spending",
        priority: 1,
        color: "mint",
        archived: false,
        balance: 0,
        refillTo: 40_000,
        amount: null,
        dueDate: null,
        target: null,
        targetDate: null,
        fixedAmount: null,
        actualFunded: 0,
      },
    ],
  });
  expect(month.paycheckCount).toBe(2);
  expect(month.feasibility).toMatchObject({
    expectedPaycheck: 100_000,
    billsEach: 30_000,
    refillsEach: 20_000,
    surplus: 50_000,
    need: 60_000,
    shortfall: 10_000,
  });
  const tax = month.feasibility?.buckets.find((bucket) => bucket.bucketId === "tax");
  expect(tax).toMatchObject({ perPaycheck: 40_000, laterDate: "2026-03-14" });
  expect(month.funding.items.find((item) => item.bucketId === "tax")).toMatchObject({ planned: 80_000, paychecks: 2 });
  expect(month.funding.items.find((item) => item.bucketId === "steady")).toMatchObject({ perPaycheck: 20_000, planned: 40_000 });
});

test("the current month compares planned amounts with linked actuals", () => {
  const links: MonthPlanLink[] = [
    { planId: "pay", dueDate: "2026-01-02", skipped: false, actual: 120_000 },
    { planId: "rent", dueDate: "2026-01-10", skipped: false, actual: -35_000 },
    { planId: "rent", dueDate: "2026-01-24", skipped: true, actual: null },
  ];
  const month = buildMonthPlan({
    month: "2026-01",
    asOf: "2026-01-15",
    links,
    plans: [
      income("pay", 100_000, biweekly),
      bill("rent", 40_000, schedule("2026-01-10", "weekly", 2)),
    ],
    buckets: [
      {
        ...goal("trip", 90_000, "2026-04-01", null),
        actualFunded: 10_000,
      },
    ],
  });
  expect(month.compareActual).toBe(true);
  expect(month.income).toEqual({ planned: 300_000, actual: 120_000 });
  expect(month.bills.planned).toBe(40_000);
  expect(month.bills.actual).toBe(35_000);
  expect(month.bills.items.map((item) => item.dueDate)).toEqual(["2026-01-10"]);
  expect(month.funding.actual).toBe(10_000);
  expect(month.leftToSave).toEqual({
    planned: month.income.planned - month.bills.planned - month.funding.planned,
    actual: 120_000 - 35_000 - 10_000,
  });

  const future = buildMonthPlan({
    month: "2026-03",
    asOf: "2026-01-15",
    links: [],
    plans: [income("pay", 100_000, biweekly)],
    buckets: [],
  });
  expect(future.compareActual).toBe(false);
});
