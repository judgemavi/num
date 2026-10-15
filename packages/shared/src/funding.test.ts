import { expect, test } from "bun:test";
import { monthlyAmount, monthsUntil, roundUpShare, unassigned, type MonthlyBucket } from "./funding";
import type { PlanSchedule } from "./recurring-calc";

const none: MonthlyBucket = {
  kind: "spending",
  startDate: "2000-01-01",
  commitment: null,
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
  const before = unassigned(200_000, 50_000);
  const afterPurchase = unassigned(200_000 - 20_000, 50_000 - 20_000);
  expect(afterPurchase).toBe(before);
  expect(unassigned(200_000, 50_000) - unassigned(180_000, 50_000)).toBe(20_000);
});

function commitment(schedule: Partial<PlanSchedule>, amount: number, startDate = "2000-01-01", skipped: string[] = []): MonthlyBucket {
  return {
    ...none,
    kind: "commitment",
    startDate,
    commitment: {
      schedule: { startDate: "2026-01-02", endDate: null, freq: "monthly", interval: 1, monthDay: null, businessDayShift: "none", ...schedule },
      amount,
      skipped: new Set(skipped),
      paid: new Map(),
    },
  };
}

test("a monthly commitment asks for the occurrences of the month minus the balance, never below 0", () => {
  const rent = commitment({ monthDay: 15 }, 100_000);
  expect(monthlyAmount(rent, 0, month, 10)).toBe(100_000);
  expect(monthlyAmount(rent, 40_000, month, 10)).toBe(60_000);
  expect(monthlyAmount(rent, 100_000, month, 10)).toBe(0);
  expect(monthlyAmount(rent, 150_000, month, 10)).toBe(0);
});

test("a weekly commitment counts each occurrence in the month, but not the occurrences before the start date or the skipped ones", () => {
  // October 2026 has five Fridays: 2, 9, 16, 23 and 30.
  const gym = { freq: "weekly" as const, startDate: "2026-01-02" };
  expect(monthlyAmount(commitment(gym, 1_000), 0, month, 10)).toBe(5_000);
  expect(monthlyAmount(commitment(gym, 1_000, "2026-10-20"), 0, month, 10)).toBe(2_000);
  expect(monthlyAmount(commitment(gym, 1_000, "2000-01-01", ["2026-10-09"]), 0, month, 10)).toBe(4_000);
  expect(monthlyAmount(commitment(gym, 1_000, "2026-11-01"), 0, month, 10)).toBe(0);
});

test("a yearly commitment spreads the next amount over the months to its month, and asks for the whole shortfall in that month", () => {
  const insurance = { freq: "yearly" as const, startDate: "2026-03-10" };
  // The next occurrence is 2027-03-10: 5 months from October.
  expect(monthlyAmount(commitment(insurance, 12_000), 0, month, 10)).toBe(2_400);
  expect(monthlyAmount(commitment(insurance, 12_000), 2_000, month, 10)).toBe(2_000);
  expect(monthlyAmount(commitment(insurance, 12_000), 12_000, month, 10)).toBe(0);
  expect(monthlyAmount(commitment(insurance, 12_000), 3_000, "2027-03", 10)).toBe(9_000);
  // Every second year, or with the next occurrence skipped: 2028-03-10 is 17 months away. 12 000 / 17 rounds up to 710.
  expect(monthlyAmount(commitment({ ...insurance, interval: 2 }, 12_000), 0, month, 10)).toBe(710);
  expect(monthlyAmount(commitment(insurance, 12_000, "2000-01-01", ["2027-03-10"]), 0, month, 10)).toBe(710);
});

test("an income has no monthly amount", () => {
  expect(monthlyAmount({ ...none, kind: "income" }, 0, month, 10)).toBe(0);
});

test("an occurrence that was paid before the month is not asked for again", () => {
  const rent = commitment({ monthDay: 1 }, 100_000);
  const early = { ...rent, commitment: rent.commitment && { ...rent.commitment, paid: new Map([["2026-10-01", "2026-09-30"]]) } };
  expect(monthlyAmount(rent, 0, month, 10)).toBe(100_000);
  expect(monthlyAmount(early, 0, month, 10)).toBe(0);
  // A payment on the due date is in the month, thus it is still asked for.
  const onTime = { ...rent, commitment: rent.commitment && { ...rent.commitment, paid: new Map([["2026-10-01", "2026-10-01"]]) } };
  expect(monthlyAmount(onTime, 0, month, 10)).toBe(100_000);
});
