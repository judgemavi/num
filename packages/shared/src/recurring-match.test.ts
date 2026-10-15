import { expect, test } from "bun:test";
import type { PlanSchedule } from "./recurring-calc";
import { isLinkCandidate, matchLinks, openOccurrences, type LinkTransaction, type OpenOccurrence } from "./recurring-match";

/** A monthly occurrence due 2026-10-04 with its window from 2026-09-19 to 2026-10-20 (not included). */
function occurrence(bucketId: string, dueDate = "2026-10-04", merchantId: string | null = "merchant-1"): OpenOccurrence {
  return { bucketId, dueDate, start: "2026-09-19", end: "2026-10-20", accountId: "account-1", merchantId, expectedAmount: -16990, tolerance: 1000 };
}

function payment(id: string, date: string, amount = -16990, merchantId: string | null = "merchant-1"): LinkTransaction {
  return { id, accountId: "account-1", date, amount, merchantId };
}

test("a candidate has the account, a date in the window, the merchant if set and an amount in the tolerance", () => {
  const plan = occurrence("plan-1");
  expect(isLinkCandidate(plan, payment("txn-1", "2026-09-19"))).toBe(true);
  expect(isLinkCandidate(plan, payment("txn-1", "2026-10-19"))).toBe(true);
  expect(isLinkCandidate(plan, payment("txn-1", "2026-09-18"))).toBe(false);
  expect(isLinkCandidate(plan, payment("txn-1", "2026-10-20"))).toBe(false);
  expect(isLinkCandidate(plan, payment("txn-1", "2026-10-04", -16990, "other"))).toBe(false);
  expect(isLinkCandidate(plan, payment("txn-1", "2026-10-04", -19000))).toBe(false);
  expect(isLinkCandidate(plan, { ...payment("txn-1", "2026-10-04"), accountId: "account-2" })).toBe(false);
  expect(isLinkCandidate({ ...plan, merchantId: null }, payment("txn-1", "2026-10-04", -16990, null))).toBe(true);
});

test("a payment 5 days late links to its monthly occurrence", () => {
  const one = matchLinks([occurrence("plan-1")], [payment("txn-1", "2026-10-09")]);
  expect(one.unique).toEqual([{ bucketId: "plan-1", dueDate: "2026-10-04", transactionId: "txn-1" }]);
  expect(one.ambiguous).toEqual([]);
});

test("of two payments in the window, the one nearest to the due date links; at the same distance it needs review", () => {
  const nearest = matchLinks([occurrence("plan-1")], [payment("txn-1", "2026-10-09"), payment("txn-2", "2026-10-03")]);
  expect(nearest.unique).toEqual([{ bucketId: "plan-1", dueDate: "2026-10-04", transactionId: "txn-2" }]);
  const tied = matchLinks([occurrence("plan-1")], [payment("txn-1", "2026-10-06"), payment("txn-2", "2026-10-02")]);
  expect(tied.unique).toEqual([]);
  expect(tied.ambiguous).toEqual([{ bucketId: "plan-1", dueDate: "2026-10-04", transactionIds: ["txn-2", "txn-1"] }]);
});

test("one candidate of two schedules needs review", () => {
  const shared = matchLinks([occurrence("plan-1"), occurrence("plan-2")], [payment("txn-1", "2026-10-04")]);
  expect(shared.unique).toEqual([]);
  expect(shared.ambiguous).toHaveLength(2);
});

test("a payment links to the nearest occurrence, not to the next one", () => {
  const monthly: PlanSchedule = { startDate: "2026-01-04", endDate: null, freq: "monthly", interval: 1, monthDay: 4, businessDayShift: "none" };
  const schedule = { ...monthly, id: "plan-1", accountId: "account-1", merchantId: "merchant-1", expectedAmount: -16990, tolerance: 1000 };
  const open = openOccurrences([schedule], new Set(["plan-1|2026-09-04"]), "2026-10-25");
  // The window of 2026-11-04 starts on 2026-10-20. Thus it is open on 2026-10-25, and 2026-12-04 is not.
  expect(open.map((item) => item.dueDate).slice(-2)).toEqual(["2026-10-04", "2026-11-04"]);
  expect(matchLinks(open, [payment("txn-1", "2026-10-09")]).unique).toEqual([{ bucketId: "plan-1", dueDate: "2026-10-04", transactionId: "txn-1" }]);
  expect(matchLinks(open, [payment("txn-1", "2026-10-21")]).unique).toEqual([{ bucketId: "plan-1", dueDate: "2026-11-04", transactionId: "txn-1" }]);
});
