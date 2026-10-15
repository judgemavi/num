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
    repeat: null,
    target,
    targetDate,
    fixedAmount,
    fillMonths: null,
    startDate: "2000-01-01",
    actualFunded: 0,
  };
}

const biweekly = schedule("2026-01-02", "weekly", 2);

test("monthly totals count weekly, biweekly and monthly occurrences, including a 3-paycheck month", () => {
  const january = buildMonthPlan({
    month: "2026-01",
    step: 10,
    asOf: "2026-01-15",
    links: [],
    buckets: [goal("save", 10_000, null, 100)],
    plans: [
      income("week", 1_000, schedule("2026-01-02", "weekly", 1)),
      income("two-weeks", 1_000, biweekly),
      income("month", 1_000, schedule("2026-01-15", "monthly", 1, 15)),
      income("other", 500, schedule("2026-01-20", "monthly", 1, 20), false),
    ],
  });
  expect(january.income.planned).toBe(1_000 * 5 + 1_000 * 3 + 1_000 + 500);
  expect(january.funding.items.find((item) => item.bucketId === "save")).toMatchObject({ planned: 100 });

  const february = buildMonthPlan({
    month: "2026-02",
    step: 10,
    asOf: "2026-02-01",
    links: [],
    buckets: [],
    plans: [income("two-weeks", 1_000, biweekly)],
  });
  expect(february.income.planned).toBe(2_000);
});

test("variable income uses the median of the last 6, and the plan amount when fewer than 3 exist", () => {
  const links: MonthPlanLink[] = [
    { planId: "pay", dueDate: "2025-12-19", skipped: false, actual: 500 },
    { planId: "pay", dueDate: "2025-12-05", skipped: false, actual: 1_000 },
    { planId: "pay", dueDate: "2025-11-21", skipped: false, actual: 2_000 },
    { planId: "pay", dueDate: "2025-11-07", skipped: false, actual: 3_000 },
    { planId: "pay", dueDate: "2025-10-24", skipped: false, actual: 4_000 },
    { planId: "pay", dueDate: "2025-10-10", skipped: false, actual: 5_000 },
    { planId: "pay", dueDate: "2025-09-26", skipped: false, actual: 99_990 },
  ];
  const month = buildMonthPlan({
    month: "2026-01",
    step: 10,
    asOf: "2026-01-15",
    links,
    buckets: [],
    plans: [income("pay", 10_000, biweekly, true, "variable")],
  });
  expect(month.income.planned).toBe(2_500 * 3);
  // 26 safe amounts of 500 in 12 months, divided by 12, rounded to a cent.
  expect(month.feasibility?.income).toBe(1_080);

  const few = buildMonthPlan({
    month: "2026-01",
    step: 10,
    asOf: "2026-01-15",
    links: links.slice(0, 2),
    buckets: [],
    plans: [income("pay", 10_000, biweekly, true, "variable")],
  });
  expect(few.income.planned).toBe(10_000 * 3);

  const power = buildMonthPlan({
    month: "2026-02",
    step: 10,
    asOf: "2026-02-01",
    links: [
      { planId: "power", dueDate: "2025-11-15", skipped: false, actual: -1_000 },
      { planId: "power", dueDate: "2025-12-15", skipped: false, actual: -3_000 },
      { planId: "power", dueDate: "2026-01-15", skipped: false, actual: -5_000 },
    ],
    buckets: [],
    plans: [income("pay", 100_000, biweekly), bill("power", 10_000, schedule("2026-02-15", "monthly", 1, 15), "variable")],
  });
  expect(power.bills.planned).toBe(3_000);
  expect(power.feasibility?.bills).toBe(5_000);
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
    amount: 1_200_000,
    dueDate: "2026-02-28",
    repeat: null,
    target: null,
    targetDate: null,
    fixedAmount: null,
    fillMonths: null,
    startDate: "2000-01-01",
    actualFunded: 0,
  };
  const month = buildMonthPlan({
    month: "2026-02",
    step: 10,
    asOf: "2026-02-01",
    links: [],
    plans: [
      income("pay", 1_000_000, biweekly),
      bill("rent", 600_000, schedule("2026-02-15", "monthly", 1, 15)),
    ],
    buckets: [
      sinking,
      goal("steady", 500_000, null, 200_000),
      {
        id: "food",
        name: "Food",
        kind: "spending",
        priority: 1,
        color: "mint",
        archived: false,
        balance: 0,
        refillTo: 400_000,
        amount: null,
        dueDate: null,
        repeat: null,
        target: null,
        targetDate: null,
        fixedAmount: null,
        fillMonths: null,
        startDate: "2000-01-01",
        actualFunded: 0,
      },
    ],
  });
  expect(month.feasibility).toMatchObject({
    income: 2_166_670,
    bills: 600_000,
    refills: 400_000,
    surplus: 1_166_670,
    need: 1_400_000,
    shortfall: 233_330,
  });
  const tax = month.feasibility?.buckets.find((bucket) => bucket.bucketId === "tax");
  expect(tax).toMatchObject({ monthly: 1_200_000, laterDate: "2026-04-01" });
  expect(month.funding.items.find((item) => item.bucketId === "tax")).toMatchObject({ planned: 1_200_000 });
  expect(month.funding.items.find((item) => item.bucketId === "steady")).toMatchObject({ planned: 200_000 });
});

test("the monthly surplus subtracts the emergency amount", () => {
  const month = buildMonthPlan({
    month: "2026-02",
    step: 10,
    asOf: "2026-02-01",
    links: [],
    plans: [income("pay", 1_000_000, biweekly)],
    buckets: [
      {
        id: "fund",
        name: "Emergency fund",
        kind: "emergency",
        priority: 1,
        color: "sky",
        archived: false,
        balance: 0,
        refillTo: null,
        amount: null,
        dueDate: null,
        repeat: null,
        // 2 600 000 over 12 months is 216 666.67. It rounds up to 216 670.
        target: 2_600_000,
        targetDate: null,
        fixedAmount: null,
        fillMonths: 12,
        startDate: "2000-01-01",
        actualFunded: 0,
      },
    ],
  });
  expect(month.feasibility).toMatchObject({ income: 2_166_670, emergency: 216_670, surplus: 1_950_000, need: 0, shortfall: 0 });
  expect(month.funding.items).toMatchObject([{ kind: "emergency", planned: 216_670 }]);
});

test("the current month compares planned amounts with linked actuals", () => {
  const links: MonthPlanLink[] = [
    { planId: "pay", dueDate: "2026-01-02", skipped: false, actual: 1_200_000 },
    { planId: "rent", dueDate: "2026-01-10", skipped: false, actual: -350_000 },
    { planId: "rent", dueDate: "2026-01-24", skipped: true, actual: null },
  ];
  const month = buildMonthPlan({
    month: "2026-01",
    step: 10,
    asOf: "2026-01-15",
    links,
    plans: [
      income("pay", 1_000_000, biweekly),
      bill("rent", 400_000, schedule("2026-01-10", "weekly", 2)),
    ],
    buckets: [
      {
        ...goal("trip", 900_000, "2026-04-01", null),
        actualFunded: 100_000,
      },
    ],
  });
  expect(month.compareActual).toBe(true);
  expect(month.income).toEqual({ planned: 3_000_000, actual: 1_200_000 });
  expect(month.bills.planned).toBe(400_000);
  expect(month.bills.actual).toBe(350_000);
  expect(month.bills.items.map((item) => item.dueDate)).toEqual(["2026-01-10"]);
  expect(month.funding.actual).toBe(100_000);
  expect(month.leftToSave).toEqual({
    planned: month.income.planned - month.bills.planned - month.funding.planned,
    actual: 1_200_000 - 350_000 - 100_000,
  });

  const future = buildMonthPlan({
    month: "2026-03",
    step: 10,
    asOf: "2026-01-15",
    links: [],
    plans: [income("pay", 1_000_000, biweekly)],
    buckets: [],
  });
  expect(future.compareActual).toBe(false);
});

test("a future month uses planned funding from earlier months, not today's balance", () => {
  const trip = goal("trip", 3_000, "2026-04-01", null, 0);
  const january = buildMonthPlan({
    month: "2026-01",
    step: 10,
    asOf: "2026-01-15",
    links: [],
    buckets: [trip],
    plans: [income("pay", 1_000_000, schedule("2026-01-01", "monthly", 1, 1))],
  });
  const march = buildMonthPlan({
    month: "2026-03",
    step: 10,
    asOf: "2026-01-15",
    links: [],
    buckets: [trip],
    plans: [income("pay", 1_000_000, schedule("2026-01-01", "monthly", 1, 1))],
  });
  expect(january.funding.items.find((item) => item.bucketId === "trip")?.planned).toBe(1_000);
  expect(march.funding.items.find((item) => item.bucketId === "trip")?.planned).toBe(1_000);
  expect(march.feasibility?.need).toBe(1_000);
});

test("goals that are short together each get a later date from a share of the surplus", () => {
  const month = buildMonthPlan({
    month: "2026-02",
    step: 10,
    asOf: "2026-02-01",
    links: [],
    plans: [income("pay", 100_000, biweekly)],
    buckets: [
      { ...goal("north", 800_000, "2026-02-28", null), priority: 1, name: "North" },
      { ...goal("south", 800_000, "2026-02-28", null), priority: 2, name: "South" },
    ],
  });
  expect(month.feasibility?.surplus).toBe(216_670);
  expect(month.feasibility?.shortfall).toBe(1_383_330);
  const dates = month.feasibility?.buckets.map((bucket) => bucket.laterDate) ?? [];
  expect(dates.every((date) => date !== null)).toBe(true);
  expect(new Set(dates).size).toBe(1);
});

test("the monthly amount of a goal is a whole number of the currency's minor unit", () => {
  const plan = (step: number) =>
    buildMonthPlan({
      month: "2026-01",
      step,
      asOf: "2026-01-01",
      links: [],
      buckets: [goal("trip", 10_000, "2026-04-15", null)],
      plans: [income("pay", 3_000_000, biweekly)],
    });
  expect(plan(10).funding.items[0]?.planned).toBe(3_340);
  expect(plan(1000).funding.items[0]?.planned).toBe(4_000);
});

test("feasibility income is the yearly amount of the income plans divided by 12, not the paychecks of the month", () => {
  const plans = [income("week", 1_000, schedule("2026-01-02", "weekly", 1))];
  const january = buildMonthPlan({ month: "2026-01", step: 10, asOf: "2026-01-15", links: [], buckets: [], plans });
  const february = buildMonthPlan({ month: "2026-02", step: 10, asOf: "2026-02-01", links: [], buckets: [], plans });
  expect(january.income.planned).toBe(5_000);
  expect(january.feasibility?.income).toBe(4_330);
  expect(february.feasibility?.income).toBe(4_330);
});
