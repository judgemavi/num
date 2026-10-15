import { expect, test } from "bun:test";
import { forecastDates } from "./forecast";
import { billNeed, pausePlan, projectedPoolShort, recedeOrder, recedePlan } from "./pool";

const asOf = "2026-10-01";
const dates = forecastDates(asOf);
const spend = (date: string, spending: number, bucketId: string | null) => ({ date, income: 0, spending, bucketId });

test("the projected pool gives the first negative date and the short amount", () => {
  const flows = [
    // A flow on asOf is not in (asOf, d].
    spend("2026-10-01", 1_000, null),
    // Food spends 400 of its 500 balance: the pool does not change. Then 300 more: 200 is over the balance.
    spend("2026-10-02", 400, "food"),
    spend("2026-10-03", 300, "food"),
    spend("2026-10-05", 400, null),
    { date: "2026-10-06", income: 50, spending: 0, bucketId: "pay" },
  ];
  expect(projectedPoolShort({ asOf, dates, unassigned: 100, flows, balances: new Map([["food", 500]]), step: 10 })).toEqual({
    date: "2026-10-03",
    short: 500,
  });
});

test("outflow inside the bucket balance does not count, and a negative balance holds nothing", () => {
  const inside = projectedPoolShort({ asOf, dates, unassigned: 0, flows: [spend("2026-10-10", 500, "food")], balances: new Map([["food", 500]]), step: 10 });
  expect(inside).toEqual({ date: null, short: 0 });
  const negative = projectedPoolShort({ asOf, dates, unassigned: 0, flows: [spend("2026-10-10", 500, "food")], balances: new Map([["food", -200]]), step: 10 });
  expect(negative).toEqual({ date: "2026-10-10", short: 500 });
});

const savings = [
  { id: "a-trip", kind: "goal" as const, priority: 5, canRecede: true },
  { id: "b-car", kind: "sinking" as const, priority: 9, canRecede: false },
  { id: "c-fund", kind: "emergency" as const, priority: 7, canRecede: true },
  { id: "d-house", kind: "goal" as const, priority: 8, canRecede: true },
  { id: "e-food", kind: "spending" as const, priority: 10, canRecede: null },
];

test("the recede order has the savings buckets with canRecede, the lowest priority first, and the emergency bucket by its priority", () => {
  expect(recedeOrder(savings).map((bucket) => bucket.id)).toEqual(["d-house", "c-fund", "a-trip"]);
});

test("a recede plan takes each balance down to 0 in order, stops when the short amount is met and gives the part not covered", () => {
  const order = [
    { id: "d-house", balance: 300 },
    { id: "c-fund", balance: -50 },
    { id: "a-trip", balance: 1_000 },
  ];
  expect(recedePlan(order, 500, 10)).toEqual({
    items: [
      { bucketId: "d-house", amount: 300 },
      { bucketId: "a-trip", amount: 200 },
    ],
    uncovered: 0,
  });
  expect(recedePlan(order, 2_000, 10)).toEqual({
    items: [
      { bucketId: "d-house", amount: 300 },
      { bucketId: "a-trip", amount: 1_000 },
    ],
    uncovered: 700,
  });
});

const candidates = [
  { id: "bill-gym", kind: "commitment" as const, priority: 0, essential: false, paused: false, monthly: 400 },
  { id: "bill-rent", kind: "commitment" as const, priority: 0, essential: true, paused: false, monthly: 9_000 },
  { id: "eat-out", kind: "spending" as const, priority: 3, essential: false, paused: false, monthly: 200 },
  { id: "fun", kind: "spending" as const, priority: 6, essential: false, paused: false, monthly: 100 },
  { id: "food", kind: "spending" as const, priority: 1, essential: true, paused: false, monthly: 3_000 },
  { id: "trip", kind: "goal" as const, priority: 4, essential: null, paused: false, monthly: 300 },
  { id: "car", kind: "sinking" as const, priority: 5, essential: null, paused: false, monthly: 150 },
  { id: "gifts", kind: "goal" as const, priority: 7, essential: null, paused: true, monthly: 900 },
  { id: "fund", kind: "emergency" as const, priority: 8, essential: null, paused: false, monthly: 5_000 },
  { id: "boat", kind: "goal" as const, priority: 9, essential: null, paused: false, monthly: 0 },
];

test("the pause suggestion: non-essential spending, then goal and sinking, then non-essential bills, the lowest priority first", () => {
  expect(pausePlan(candidates, 100_000).map((item) => item.bucketId)).toEqual(["fun", "eat-out", "car", "trip", "bill-gym"]);
});

test("the pause suggestion stops when the monthly amounts meet the short amount", () => {
  expect(pausePlan(candidates, 300)).toEqual([
    { bucketId: "fun", monthly: 100 },
    { bucketId: "eat-out", monthly: 200 },
  ]);
  expect(pausePlan(candidates, 301)).toEqual([
    { bucketId: "fun", monthly: 100 },
    { bucketId: "eat-out", monthly: 200 },
    { bucketId: "car", monthly: 150 },
  ]);
});

const monthly = { startDate: "2026-01-15", endDate: null, freq: "monthly" as const, interval: 1, monthDay: 15, businessDayShift: "none" as const };
const bill = { schedule: monthly, amount: 1_000, startDate: "2026-01-01", closed: new Set<string>(), balance: 400, asOf: "2026-10-01" };

test("a bill is short when its next payment is due in the next 30 days and the balance is less than its amount", () => {
  expect(billNeed(bill)).toEqual({ dueDate: "2026-10-15", amount: 1_000, short: 600 });
  expect(billNeed({ ...bill, balance: 1_200 })).toEqual({ dueDate: "2026-10-15", amount: 1_000, short: 0 });
  expect(billNeed({ ...bill, balance: -300 })).toEqual({ dueDate: "2026-10-15", amount: 1_000, short: 1_000 });
});

test("a bill due more than 30 days after asOf is not short", () => {
  expect(billNeed({ ...bill, asOf: "2026-09-15", closed: new Set(["2026-09-15"]) })).toEqual({ dueDate: "2026-10-15", amount: 1_000, short: 600 });
  expect(billNeed({ ...bill, asOf: "2026-09-14", closed: new Set(["2026-09-15"]) })).toEqual({ dueDate: "2026-10-15", amount: 1_000, short: 0 });
  const yearly = { ...monthly, freq: "yearly" as const, startDate: "2026-12-15" };
  expect(billNeed({ ...bill, schedule: yearly })).toEqual({ dueDate: "2026-12-15", amount: 1_000, short: 0 });
});

test("skipped and linked occurrences are not counted: the next open occurrence counts", () => {
  expect(billNeed({ ...bill, closed: new Set(["2026-10-15"]) })).toEqual({ dueDate: "2026-11-15", amount: 1_000, short: 0 });
  expect(billNeed({ ...bill, asOf: "2026-10-20", closed: new Set(["2026-11-15"]) })).toEqual({ dueDate: "2026-12-15", amount: 1_000, short: 0 });
});

test("a bill due more than one time in a month needs the open occurrences of that month", () => {
  const weekly = { startDate: "2026-10-02", endDate: null, freq: "weekly" as const, interval: 1, monthDay: null, businessDayShift: "none" as const };
  // Fridays in October 2026: 2, 9, 16, 23, 30. The 2nd is linked.
  expect(billNeed({ ...bill, schedule: weekly, amount: 100, closed: new Set(["2026-10-02"]) })).toEqual({ dueDate: "2026-10-09", amount: 400, short: 0 });
  expect(billNeed({ ...bill, schedule: weekly, amount: 200, closed: new Set(["2026-10-02"]) })).toEqual({ dueDate: "2026-10-09", amount: 800, short: 400 });
});

test("a bill starts at the start date of its bucket, and an ended schedule has no next payment", () => {
  expect(billNeed({ ...bill, startDate: "2026-10-20" })).toEqual({ dueDate: "2026-11-15", amount: 1_000, short: 0 });
  expect(billNeed({ ...bill, schedule: { ...monthly, endDate: "2026-09-30" } })).toBeNull();
});
