import { expect, test } from "bun:test";
import { comparePriority } from "./bucket";
import { buildMonthPlan, type MonthPlanBucketSource, type MonthPlanLink, type MonthPlanSource } from "./month-plan";
import type { PlanSchedule } from "./recurring-calc";

function schedule(startDate: string, freq: PlanSchedule["freq"], interval: number, monthDay: number | null = null): PlanSchedule {
  return { startDate, endDate: null, freq, interval, monthDay, businessDayShift: "none" };
}

function income(id: string, amount: number, plan: PlanSchedule, amountMode: "fixed" | "variable" = "fixed"): MonthPlanSource {
  return {
    id,
    name: id,
    kind: "income",
    amountMode,
    expectedAmount: amount,
    archived: false,
    paused: false,
    schedule: plan,
  };
}

function commitment(id: string, amount: number, plan: PlanSchedule, amountMode: "fixed" | "variable" = "fixed"): MonthPlanSource {
  return {
    id,
    name: id,
    kind: "commitment",
    amountMode,
    expectedAmount: -Math.abs(amount),
    archived: false,
    paused: false,
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
    paused: false,
    balance,
    refillTo: null,
    amount: null,
    dueDate: null,
    repeat: null,
    target,
    targetDate,
    fixedAmount,
    startDate: "2000-01-01",
    actualFunded: 0,
    commitment: null,
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
      income("other", 500, schedule("2026-01-20", "monthly", 1, 20)),
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
    { bucketId: "pay", dueDate: "2025-12-19", skipped: false, actual: 500 },
    { bucketId: "pay", dueDate: "2025-12-05", skipped: false, actual: 1_000 },
    { bucketId: "pay", dueDate: "2025-11-21", skipped: false, actual: 2_000 },
    { bucketId: "pay", dueDate: "2025-11-07", skipped: false, actual: 3_000 },
    { bucketId: "pay", dueDate: "2025-10-24", skipped: false, actual: 4_000 },
    { bucketId: "pay", dueDate: "2025-10-10", skipped: false, actual: 5_000 },
    { bucketId: "pay", dueDate: "2025-09-26", skipped: false, actual: 99_990 },
  ];
  const month = buildMonthPlan({
    month: "2026-01",
    step: 10,
    asOf: "2026-01-15",
    links,
    buckets: [],
    plans: [income("pay", 10_000, biweekly, "variable")],
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
    plans: [income("pay", 10_000, biweekly, "variable")],
  });
  expect(few.income.planned).toBe(10_000 * 3);

  const power = buildMonthPlan({
    month: "2026-02",
    step: 10,
    asOf: "2026-02-01",
    links: [
      { bucketId: "power", dueDate: "2025-11-15", skipped: false, actual: -1_000 },
      { bucketId: "power", dueDate: "2025-12-15", skipped: false, actual: -3_000 },
      { bucketId: "power", dueDate: "2026-01-15", skipped: false, actual: -5_000 },
    ],
    buckets: [],
    plans: [income("pay", 100_000, biweekly), commitment("power", 10_000, schedule("2026-02-15", "monthly", 1, 15), "variable")],
  });
  expect(power.feasibility?.commitments).toBe(5_000);
});

test("a shortfall shows a later date that fits and the amount to cut elsewhere", () => {
  const sinking: MonthPlanBucketSource = {
    id: "tax",
    name: "Tax",
    kind: "sinking",
    priority: 1,
    color: "sky",
    archived: false,
    paused: false,
    balance: 0,
    refillTo: null,
    amount: 1_200_000,
    dueDate: "2026-02-28",
    repeat: null,
    target: null,
    targetDate: null,
    fixedAmount: null,
    startDate: "2000-01-01",
    actualFunded: 0,
    commitment: null,
  };
  const month = buildMonthPlan({
    month: "2026-02",
    step: 10,
    asOf: "2026-02-01",
    links: [],
    plans: [
      income("pay", 1_000_000, biweekly),
      commitment("rent", 600_000, schedule("2026-02-15", "monthly", 1, 15)),
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
        paused: false,
        balance: 0,
        refillTo: 400_000,
        amount: null,
        dueDate: null,
        repeat: null,
        target: null,
        targetDate: null,
        fixedAmount: null,
        startDate: "2000-01-01",
        actualFunded: 0,
        commitment: null,
      },
    ],
  });
  expect(month.feasibility).toMatchObject({
    income: 2_166_670,
    commitments: 600_000,
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

test("the monthly surplus does not subtract an emergency amount", () => {
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
        paused: false,
        balance: 0,
        refillTo: null,
        amount: null,
        dueDate: null,
        repeat: null,
        target: 2_600_000,
        targetDate: null,
        fixedAmount: null,
        startDate: "2000-01-01",
        actualFunded: 0,
        commitment: null,
      },
    ],
  });
  expect(month.feasibility).toMatchObject({ income: 2_166_670, surplus: 2_166_670, need: 0, shortfall: 0 });
  expect(month.funding.items).toMatchObject([{ kind: "emergency", planned: 2_600_000 }]);
});

test("the current month compares planned amounts with linked actuals", () => {
  const links: MonthPlanLink[] = [
    { bucketId: "pay", dueDate: "2026-01-02", skipped: false, actual: 1_200_000 },
    { bucketId: "rent", dueDate: "2026-01-10", skipped: false, actual: -350_000 },
    { bucketId: "rent", dueDate: "2026-01-24", skipped: true, actual: null },
  ];
  const month = buildMonthPlan({
    month: "2026-01",
    step: 10,
    asOf: "2026-01-15",
    links,
    plans: [
      income("pay", 1_000_000, biweekly),
      commitment("rent", 400_000, schedule("2026-01-10", "weekly", 2)),
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
  expect(month.funding.actual).toBe(100_000);
  expect(month.leftToSave).toEqual({
    planned: month.income.planned - month.funding.planned,
    actual: 1_200_000 - 100_000,
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

function commitmentBucket(id: string, schedule: PlanSchedule, amount: number, priority = 0): MonthPlanBucketSource {
  return { ...goal(id, 0, null, null), kind: "commitment", priority, color: "sky", commitment: { schedule, amount, skipped: new Set(), paid: new Map() } };
}

test("the commitments are the monthly amounts of the commitment buckets, apart from the funding, and feasibility uses yearly / 12", () => {
  const rent = schedule("2026-01-15", "monthly", 1, 15);
  const insurance = schedule("2026-03-10", "yearly", 1, 10);
  const plans = [income("pay", 1_000_000, biweekly), commitment("rent", 600_000, rent), commitment("insurance", 120_000, insurance)];
  const buckets = [commitmentBucket("rent", rent, 600_000), commitmentBucket("insurance", insurance, 120_000, 1)];
  const february = buildMonthPlan({ month: "2026-02", step: 10, asOf: "2026-02-01", links: [], plans, buckets });
  expect(february.commitments.items.map((item) => [item.bucketId, item.planned])).toEqual([
    ["rent", 600_000],
    ["insurance", 120_000],
  ]);
  expect(february.commitments.planned).toBe(720_000);
  expect(february.funding).toEqual({ planned: 0, actual: 0, items: [] });
  expect(february.leftToSave.planned).toBe(february.income.planned - 720_000);
  // Yearly / 12: 600 000 + 10 000, the same in each month.
  expect(february.feasibility?.commitments).toBe(610_000);
  const march = buildMonthPlan({ month: "2026-03", step: 10, asOf: "2026-03-01", links: [], plans, buckets });
  expect(march.feasibility?.commitments).toBe(610_000);
});

test("buckets with the same priority are in the order: commitment first, then the id", () => {
  const same = (id: string, kind: "commitment" | "emergency") => ({ id, kind, priority: 0 });
  const sorted = [same("b", "emergency"), same("z", "commitment"), same("a", "emergency"), same("c", "commitment")].sort(comparePriority);
  expect(sorted.map((item) => item.id)).toEqual(["c", "z", "a", "b"]);
  expect(comparePriority({ id: "z", kind: "commitment", priority: 1 }, { id: "a", kind: "emergency", priority: 0 })).toBeGreaterThan(0);
});
