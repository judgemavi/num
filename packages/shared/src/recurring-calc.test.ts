import { expect, test } from "bun:test";
import {
  applyBusinessDayShift,
  isInboxMissed,
  isLinkCandidate,
  matchLinks,
  medianMinor,
  occurrenceAt,
  occurrenceDates,
  variableAmounts,
  type LinkTransaction,
  type OpenOccurrence,
  type PlanSchedule,
} from "./recurring-calc";
import { detectPlans, type DetectionTransaction } from "./recurring-detect";

const monthly: PlanSchedule = {
  startDate: "2026-01-31",
  endDate: null,
  freq: "monthly",
  interval: 1,
  monthDay: 31,
  businessDayShift: "none",
};

test("monthly day 31 uses the last day of February and returns to 31", () => {
  expect(occurrenceAt(monthly, 0).dueDate).toBe("2026-01-31");
  expect(occurrenceAt(monthly, 1).dueDate).toBe("2026-02-28");
  expect(occurrenceAt(monthly, 2).dueDate).toBe("2026-03-31");
  expect(occurrenceAt({ ...monthly, startDate: "2024-01-31" }, 1).dueDate).toBe("2024-02-29");
  expect(occurrenceAt({ ...monthly, monthDay: -1, startDate: "2026-01-15" }, 1).nominalDate).toBe("2026-02-28");
});

test("an end date keeps the occurrence on that date and drops the next one", () => {
  const dates = occurrenceDates({ ...monthly, endDate: "2026-02-28" }, "2026-12-31").map((item) => item.dueDate);
  expect(dates).toEqual(["2026-01-31", "2026-02-28"]);
});

test("biweekly gives 3 paychecks in some months", () => {
  const dates = occurrenceDates(
    {
      startDate: "2026-01-02",
      endDate: null,
      freq: "weekly",
      interval: 2,
      monthDay: null,
      businessDayShift: "none",
    },
    "2026-03-31",
  ).map((item) => item.dueDate);
  expect(dates.filter((date) => date.startsWith("2026-01"))).toEqual(["2026-01-02", "2026-01-16", "2026-01-30"]);
  expect(dates.filter((date) => date.startsWith("2026-02"))).toEqual(["2026-02-13", "2026-02-27"]);
});

test("a weekend shifts to the next or previous weekday", () => {
  expect(applyBusinessDayShift("2026-01-03", "none")).toBe("2026-01-03");
  expect(applyBusinessDayShift("2026-01-03", "next")).toBe("2026-01-05");
  expect(applyBusinessDayShift("2026-01-03", "previous")).toBe("2026-01-02");
  expect(applyBusinessDayShift("2026-01-04", "next")).toBe("2026-01-05");
  expect(applyBusinessDayShift("2026-01-04", "previous")).toBe("2026-01-02");
  expect(applyBusinessDayShift("2026-01-02", "next")).toBe("2026-01-02");
  const shifted = occurrenceAt({ ...monthly, businessDayShift: "next" }, 1);
  expect(shifted.nominalDate).toBe("2026-02-28");
  expect(shifted.dueDate).toBe("2026-03-02");
});

test("a variable plan uses the median and the lowest of the last 6, then the fallback", () => {
  expect(variableAmounts([400, 200], 1000)).toEqual({ forecast: 1000, safe: 1000 });
  expect(variableAmounts([500, 400, 300, 200, 100, 50, 9999], 1000)).toEqual({ forecast: 250, safe: 50 });
  expect(medianMinor([10, 20, 30, 40])).toBe(25);
  expect(medianMinor([-3, -2])).toBe(-3);
});

function txn(id: string, date: string, amount: number, merchantId = "merchant-1"): DetectionTransaction {
  return { id, accountId: "account-1", merchantId, date, amount };
}

test("detection needs 3 transactions, regular gaps within 3 days, and amounts within 10 percent", () => {
  expect(detectPlans([txn("a", "2026-01-05", 1000), txn("b", "2026-01-12", 1000)])).toEqual([]);

  const weekly = detectPlans([
    txn("a", "2026-01-05", 1000),
    txn("b", "2026-01-12", 1000),
    txn("c", "2026-01-19", 1100),
  ]);
  expect(weekly).toHaveLength(1);
  expect(weekly[0]).toMatchObject({ freq: "weekly", interval: 1, amountMode: "variable", expectedAmount: 1000 });

  expect(
    detectPlans([
      txn("a", "2026-01-05", 1000),
      txn("b", "2026-01-16", 1000),
      txn("c", "2026-01-19", 1000),
    ]),
  ).toEqual([]);

  expect(
    detectPlans([
      txn("a", "2026-01-05", 1000),
      txn("b", "2026-01-12", 1000),
      txn("c", "2026-01-19", 1110),
    ]),
  ).toEqual([]);

  const biweekly = detectPlans([
    txn("a", "2026-01-02", 2000),
    txn("b", "2026-01-16", 2000),
    txn("c", "2026-01-30", 2000),
  ]);
  expect(biweekly[0]).toMatchObject({ freq: "weekly", interval: 2, amountMode: "fixed" });

  const month = detectPlans([
    txn("a", "2026-01-31", -1699),
    txn("b", "2026-02-28", -1699),
    txn("c", "2026-03-31", -1699),
  ]);
  expect(month[0]).toMatchObject({ freq: "monthly", interval: 1, monthDay: 31 });

  const year = detectPlans([
    txn("a", "2024-03-01", -5000),
    txn("b", "2025-03-01", -5000),
    txn("c", "2026-03-01", -5000),
  ]);
  expect(year[0]).toMatchObject({ freq: "yearly", interval: 1 });
});

test("an old regular run that stopped is not proposed", () => {
  expect(
    detectPlans([
      txn("a", "2024-01-15", 1000),
      txn("b", "2024-02-15", 1000),
      txn("c", "2024-03-15", 1000),
      txn("d", "2024-06-02", 1000),
    ]),
  ).toEqual([]);
});

test("detection uses the latest run and ignores history older than 18 months", () => {
  const found = detectPlans([
    txn("a", "2024-01-15", 5000),
    txn("b", "2024-02-15", 5000),
    txn("c", "2024-03-15", 5000),
    txn("d", "2024-04-15", 5000),
    txn("e", "2026-01-05", 1000),
    txn("f", "2026-01-12", 1000),
    txn("g", "2026-01-19", 1000),
  ]);
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ freq: "weekly", interval: 1, transactionIds: ["e", "f", "g"] });

  expect(
    detectPlans(
      [
        txn("a", "2024-01-15", 1000),
        txn("b", "2024-02-15", 1000),
        txn("c", "2024-03-15", 1000),
      ],
      "2026-10-07",
    ),
  ).toEqual([]);
});

function occurrence(planId: string, dueDate: string, merchantId: string | null = null): OpenOccurrence {
  return {
    planId,
    dueDate,
    accountId: "account-1",
    merchantId,
    expectedAmount: -1699,
    tolerance: 100,
  };
}

function payment(id: string, date: string, amount = -1699, merchantId: string | null = "merchant-1"): LinkTransaction {
  return { id, accountId: "account-1", date, amount, merchantId };
}

test("an old unlinked occurrence is not missed", () => {
  expect(isInboxMissed("2024-01-15", "2026-10-07", 3)).toBe(false);
  expect(isInboxMissed("2026-09-01", "2026-10-07", 3)).toBe(false);
  expect(isInboxMissed("2026-09-10", "2026-10-07", 3)).toBe(true);
  expect(isInboxMissed("2026-10-05", "2026-10-07", 3)).toBe(false);
});

test("auto-link matches one candidate and leaves every other case open", () => {
  const plan = occurrence("plan-1", "2026-03-02", "merchant-1");
  expect(isLinkCandidate(plan, payment("txn-1", "2026-03-05"), 3)).toBe(true);
  expect(isLinkCandidate(plan, payment("txn-1", "2026-03-06"), 3)).toBe(false);
  expect(isLinkCandidate(plan, payment("txn-1", "2026-03-02", -1699, "other"), 3)).toBe(false);
  expect(isLinkCandidate(plan, payment("txn-1", "2026-03-02", -1900), 3)).toBe(false);
  expect(isLinkCandidate(plan, { ...payment("txn-1", "2026-03-02"), accountId: "account-2" }, 3)).toBe(false);
  expect(isLinkCandidate({ ...plan, merchantId: null }, payment("txn-1", "2026-03-02", -1699, null), 3)).toBe(true);

  const one = matchLinks([plan], [payment("txn-1", "2026-03-02")], 3);
  expect(one.unique).toEqual([{ planId: "plan-1", dueDate: "2026-03-02", transactionId: "txn-1" }]);
  expect(one.ambiguous).toEqual([]);

  const twoPayments = matchLinks([plan], [payment("txn-1", "2026-03-02"), payment("txn-2", "2026-03-03")], 3);
  expect(twoPayments.unique).toEqual([]);
  expect(twoPayments.ambiguous[0]?.transactionIds).toEqual(["txn-1", "txn-2"]);

  const shared = matchLinks(
    [plan, occurrence("plan-2", "2026-03-02", "merchant-1")],
    [payment("txn-1", "2026-03-02")],
    3,
  );
  expect(shared.unique).toEqual([]);
  expect(shared.ambiguous).toHaveLength(2);
});
