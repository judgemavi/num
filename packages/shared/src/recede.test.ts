import { expect, test } from "bun:test";
import { forecastDates } from "./forecast";
import { recedeAhead } from "./recede";

const asOf = "2026-10-01";
const dates = forecastDates(asOf);
const spend = (date: string, spending: number, bucketId: string | null) => ({ date, income: 0, spending, bucketId });

test("the projected pool gives the first negative date, the amount capped at the emergency balance and the part not covered", () => {
  const flows = [
    // A flow on asOf is not in (asOf, d].
    spend("2026-10-01", 1_000, null),
    // Food spends 400 of its 500 balance: the pool does not change. Then 300 more: 200 is over the balance.
    spend("2026-10-02", 400, "food"),
    spend("2026-10-03", 300, "food"),
    spend("2026-10-05", 400, null),
    { date: "2026-10-06", income: 50, spending: 0, bucketId: "pay" },
  ];
  expect(recedeAhead({ asOf, dates, unassigned: 100, flows, balances: new Map([["food", 500]]), reserve: 300, step: 10 })).toEqual({
    date: "2026-10-03",
    amount: 300,
    uncovered: 200,
  });
});

test("outflow inside the bucket balance does not count, and a negative balance holds nothing", () => {
  const inside = recedeAhead({ asOf, dates, unassigned: 0, flows: [spend("2026-10-10", 500, "food")], balances: new Map([["food", 500]]), reserve: 1_000, step: 10 });
  expect(inside).toEqual({ date: null, amount: 0, uncovered: 0 });
  const negative = recedeAhead({ asOf, dates, unassigned: 0, flows: [spend("2026-10-10", 500, "food")], balances: new Map([["food", -200]]), reserve: 1_000, step: 10 });
  expect(negative).toEqual({ date: "2026-10-10", amount: 500, uncovered: 0 });
});
