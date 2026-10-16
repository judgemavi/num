import { expect, test } from "bun:test";
import { currencyStep } from "./currency";
import { fillPlan, payHorizon, type FillBucket, type FillSchedule } from "./fill-plan";
import { coverBills } from "./pool";

const asOf = "2026-10-01";
const step = currencyStep("CAD");
function schedule(day: number, closed: string[] = []): FillSchedule {
  return {
    schedule: { startDate: `2026-10-${String(day).padStart(2, "0")}`, endDate: null, freq: "monthly", interval: 1, monthDay: day, businessDayShift: "none" },
    startDate: asOf,
    closed: new Set(closed),
  };
}
const income = { ...schedule(1, [asOf]), schedule: { ...schedule(1).schedule, freq: "weekly" as const, interval: 2, endDate: "2026-10-15" } };
function row(id: string, kind: FillBucket["kind"], monthly: number, priority: number, day = 1): FillBucket {
  return {
    id, kind, priority, monthly, funded: 0, owed: monthly, balance: 0, paused: false,
    commitment: kind === "commitment" ? { ...schedule(day), amount: monthly } : null,
  };
}
const buckets = [row("rent", "commitment", 1_500_000, 0), row("phone", "commitment", 100_000, 0, 28), row("food", "spending", 600_000, 1), row("emergency", "emergency", 1_000_000, 2)];
const plan = (unassigned: number, rows = buckets, date = asOf, incomes = [income]) => fillPlan({ asOf: date, incomes, buckets: rows, unassigned, step });

test("October 1 funds rent and groceries before the phone payment of October 28", () => {
  expect(payHorizon(asOf, [income])).toBe("2026-10-15");
  expect(plan(1_700_000)).toEqual([{ bucketId: "rent", amount: 1_500_000 }, { bucketId: "food", amount: 200_000 }]);
});

test("enough Unassigned pays all owed amounts and then the emergency bucket", () => {
  expect(new Map(plan(2_500_000).map((item) => [item.bucketId, item.amount]))).toEqual(new Map([
    ["rent", 1_500_000], ["food", 600_000], ["phone", 100_000], ["emergency", 300_000],
  ]));
});

test("a second fill with no new money has no events", () => {
  const payments = new Map(plan(1_700_000).map((item) => [item.bucketId, item.amount]));
  const after = buckets.map((bucket) => {
    const amount = payments.get(bucket.id) ?? 0;
    return { ...bucket, balance: amount, funded: amount, owed: bucket.owed - amount };
  });
  expect(plan(0, after)).toEqual([]);
  expect(plan(1_000_000, after, "2026-10-16", [{ ...income, closed: new Set([asOf, "2026-10-15"]) }])).toEqual([
    { bucketId: "phone", amount: 100_000 }, { bucketId: "food", amount: 400_000 }, { bucketId: "emergency", amount: 500_000 },
  ]);
});

test("no later income in the month uses month end, with bills before spending before the rest", () => {
  expect(payHorizon("2026-10-16", [income])).toBe("2026-10-31");
  expect(payHorizon(asOf, [])).toBe("2026-10-31");
  expect(fillPlan({ asOf, incomes: [], buckets, unassigned: 1_700_000, step })).toEqual([
    { bucketId: "phone", amount: 100_000 }, { bucketId: "rent", amount: 1_500_000 }, { bucketId: "food", amount: 100_000 },
  ]);
});

test("a weekly bill gets only the first two occurrences before spending, and the rest in pass three", () => {
  const weekly = row("weekly", "commitment", 400_000, 0, 7);
  weekly.commitment = { ...schedule(7), amount: 100_000, schedule: { ...schedule(7).schedule, freq: "weekly", monthDay: null } };
  const rows = [weekly, row("food", "spending", 600_000, 1)];
  expect(plan(300_000, rows)).toEqual([{ bucketId: "weekly", amount: 200_000 }, { bucketId: "food", amount: 100_000 }]);
  expect(plan(600_000, rows)).toEqual([{ bucketId: "weekly", amount: 309_670 }, { bucketId: "food", amount: 290_330 }]);
});

test("the current bill gap cover uses the same plan: rent is covered and phone is short", () => {
  const parts = coverBills({
    asOf, unassigned: 1_700_000, funding: plan(1_700_000), owed: () => 0,
    order: [
      { bucketId: "rent", bill: { gap: 1_500_000, dueDate: asOf, paused: false } },
      { bucketId: "phone", bill: { gap: 100_000, dueDate: "2026-10-28", paused: false } },
      { bucketId: "food", bill: null },
    ],
  });
  expect(parts.get("rent")).toEqual({ covered: 1_500_000, short: 0 });
  expect(parts.get("phone")).toEqual({ covered: 0, short: 100_000 });
});

test("income on asOf, closed occurrences and dates in later months do not set the horizon", () => {
  expect(payHorizon(asOf, [schedule(1), schedule(10, ["2026-10-10"]), schedule(20)])).toBe("2026-10-20");
  expect(payHorizon(asOf, [schedule(1)])).toBe("2026-10-31");
});

test("spending share rounds up and subtracts the funding already paid", () => {
  expect(plan(290_330, [row("food", "spending", 600_000, 1)])).toEqual([{ bucketId: "food", amount: 290_330 }]);
  const food = { ...row("food", "spending", 600_000, 1), funded: 200_000, owed: 400_000 };
  expect(plan(90_330, [food])).toEqual([{ bucketId: "food", amount: 90_330 }]);
});

test("a late bill counts while its window is open, and paused buckets get nothing", () => {
  const bill = row("bill", "commitment", 100_000, 2, 10);
  const food = row("food", "spending", 600_000, 0);
  expect(plan(100_000, [food, bill], "2026-10-16")).toEqual([{ bucketId: "bill", amount: 100_000 }]);
  expect(plan(100_000, [food, { ...bill, paused: true }], "2026-10-16")).toEqual([{ bucketId: "food", amount: 100_000 }]);
});

test("closed and expired bill occurrences wait until pass three", () => {
  const closed = row("closed", "commitment", 100_000, 0, 10);
  closed.commitment = { ...schedule(10, ["2026-10-10"]), amount: 100_000 };
  const expired = row("expired", "commitment", 100_000, 0, 1);
  const food = row("food", "spending", 600_000, 1);
  expect(plan(100_000, [closed, expired, food], "2026-10-20")).toEqual([{ bucketId: "food", amount: 100_000 }]);
});

test("each pass respects priority and spending comes before emergency even with a lower priority", () => {
  const rows = [row("first", "spending", 600_000, 2), row("last", "spending", 600_000, 3), row("emergency", "emergency", 1_000_000, 0)];
  expect(plan(400_000, rows)).toEqual([{ bucketId: "first", amount: 290_330 }, { bucketId: "last", amount: 109_670 }]);
});
