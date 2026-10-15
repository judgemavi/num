import { expect, test } from "bun:test";
import { monthlyAmount, monthsUntil, roundUpShare, unassigned, type MonthlyBucket } from "./funding";

const none: MonthlyBucket = {
  kind: "spending",
  refillTo: null,
  amount: null,
  dueDate: null,
  repeat: null,
  target: null,
  targetDate: null,
  fixedAmount: null,
  fillMonths: null,
};

const month = "2026-10";

test("months to a date count calendar months", () => {
  expect(monthsUntil("2026-10", "2026-12-15")).toBe(2);
  expect(monthsUntil("2026-10", "2026-10-31")).toBe(0);
  expect(monthsUntil("2026-10", "2026-03-01")).toBe(-7);
  expect(monthsUntil("2026-10", "2027-10-01")).toBe(12);
});

test("a spending bucket refills to its level and never goes below 0", () => {
  const food = { ...none, refillTo: 100_000 };
  expect(monthlyAmount(food, 40_000, month, 10)).toBe(60_000);
  expect(monthlyAmount(food, -30_000, month, 10)).toBe(130_000);
  expect(monthlyAmount(food, 150_000, month, 10)).toBe(0);
});

test("a sinking bucket spreads its shortfall over the months to the due month, rounded up", () => {
  const tax = { ...none, kind: "sinking" as const, amount: 10_000, dueDate: "2026-12-20" };
  expect(monthlyAmount(tax, 1_000, month, 10)).toBe(4_500);
  expect(monthlyAmount(tax, 1_001, "2026-10", 10)).toBe(4_500);
  expect(monthlyAmount({ ...tax, amount: 100 }, 0, month, 10)).toBe(50);
  expect(monthlyAmount({ ...tax, amount: 10_000 }, 10_000, month, 10)).toBe(0);
  expect(monthlyAmount({ ...tax, amount: 10_000 }, 12_000, month, 10)).toBe(0);
});

test("a due date in this month or earlier asks for the whole shortfall", () => {
  const tax = { ...none, kind: "sinking" as const, amount: 10_000, dueDate: "2026-10-31" };
  expect(monthlyAmount(tax, 1_000, month, 10)).toBe(9_000);
  expect(monthlyAmount({ ...tax, dueDate: "2026-03-01" }, 1_000, month, 10)).toBe(9_000);
});

test("a yearly sinking bucket rolls a past due date forward by whole years", () => {
  const insurance = { ...none, kind: "sinking" as const, amount: 12_000, dueDate: "2026-03-10", repeat: "yearly" as const };
  expect(monthlyAmount(insurance, 0, month, 10)).toBe(2_400);
  expect(monthlyAmount(insurance, 0, "2026-03", 10)).toBe(12_000);
  expect(monthlyAmount({ ...insurance, repeat: "none" }, 0, month, 10)).toBe(12_000);
});

test("a goal uses its date, or its fixed amount when it has no date", () => {
  const trip = { ...none, kind: "goal" as const, target: 10_000, targetDate: "2026-12-01" };
  expect(monthlyAmount(trip, 10, month, 10)).toBe(5_000);
  const steady = { ...none, kind: "goal" as const, target: 50_000, fixedAmount: 2_500 };
  expect(monthlyAmount(steady, 40_000, month, 10)).toBe(2_500);
  expect(monthlyAmount(steady, 49_000, month, 10)).toBe(1_000);
  expect(monthlyAmount(steady, 60_000, month, 10)).toBe(0);
});

test("the emergency amount is the rate of the fill months, but not more than the shortfall", () => {
  const fund = { ...none, kind: "emergency" as const, target: 1_000_000, fillMonths: 12 };
  expect(monthlyAmount(fund, 0, month, 10)).toBe(83_340);
  expect(monthlyAmount(fund, 960_000, month, 10)).toBe(40_000);
  expect(monthlyAmount(fund, 1_200_000, month, 10)).toBe(0);
  expect(monthlyAmount({ ...fund, target: 0 }, 0, month, 10)).toBe(0);
});

test("the share of a shortfall rounds up to a whole minor unit", () => {
  expect(roundUpShare(9_000, 0, 10)).toBe(9_000);
  expect(roundUpShare(9_000, 3, 10)).toBe(3_000);
  expect(roundUpShare(100, 3, 10)).toBe(40);
  expect(roundUpShare(-5, 3, 10)).toBe(0);
});

test("a card purchase does not change Unassigned while the bucket stays positive", () => {
  const before = unassigned(200_000, 50_000, 0);
  const afterPurchase = unassigned(200_000 - 20_000, 50_000 - 20_000, 0);
  expect(afterPurchase).toBe(before);
  expect(unassigned(200_000, 50_000, 0) - unassigned(180_000, 50_000, 0)).toBe(20_000);
});
