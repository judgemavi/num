import { expect, test } from "bun:test";
import { buildInsightChanges, savingsRateMilliPct, type InsightChangesInput } from "./insights-changes";
import type { FlowLine } from "./month";

const groceries = "11111111-1111-4111-8111-111111111111";
const dining = "22222222-2222-4222-8222-222222222222";
const fuel = "33333333-3333-4333-8333-333333333333";
const rent = "44444444-4444-4444-8444-444444444444";
const travel = "55555555-5555-4555-8555-555555555555";
const gifts = "66666666-6666-4666-8666-666666666666";
const hobbies = "77777777-7777-4777-8777-777777777777";
const income = "88888888-8888-4888-8888-888888888888";

function line(month: string, amount: number, categoryId: string | null, kind: FlowLine["kind"], transfer = false): FlowLine {
  return { month, amount, categoryId, kind, transfer };
}

function changes(input: Partial<InsightChangesInput> & Pick<InsightChangesInput, "lines">) {
  return buildInsightChanges({ month: "2026-04", merchants: [], ...input });
}

test("the 3 largest changes use the median of the previous 3 months", () => {
  const months = ["2026-01", "2026-02", "2026-03"];
  const history: FlowLine[] = [];
  const series = [
    { id: groceries, prior: [1000, 2000, 3000], current: 8000 },
    { id: dining, prior: [500, 500, 500], current: 2000 },
    { id: fuel, prior: [400, 400, 400], current: 1600 },
    { id: rent, prior: [100, 100, 100], current: 800 },
    { id: travel, prior: [4000, 4000, 4000], current: 1000 },
    { id: gifts, prior: [3000, 3000, 3000], current: 500 },
    { id: hobbies, prior: [2000, 2000, 2000], current: 200 },
  ];
  for (const row of series) {
    months.forEach((month, index) => {
      history.push(line(month, -(row.prior[index] ?? 0), row.id, "expense"));
    });
    history.push(line("2026-04", -row.current, row.id, "expense"));
  }
  const result = changes({ lines: history });
  expect(result.increases.map((row) => row.categoryId)).toEqual([groceries, dining, fuel]);
  expect(result.increases[0]).toMatchObject({ amount: 8000, median: 2000, delta: 6000 });
  expect(result.decreases.map((row) => [row.categoryId, row.delta])).toEqual([
    [travel, -3000],
    [gifts, -2500],
    [hobbies, -1800],
  ]);
  expect(result.increases.some((row) => row.categoryId === rent)).toBe(false);
});

test("income, transfer and uncategorized lines are not category changes", () => {
  const result = changes({
    lines: [
      line("2026-04", 50_000, income, "income"),
      line("2026-04", -9000, groceries, "expense", true),
      line("2026-04", -7000, null, null),
      line("2026-04", -3000, dining, "expense"),
    ],
  });
  expect(result.increases).toEqual([{ categoryId: dining, amount: 3000, median: 0, delta: 3000 }]);
  expect(result.decreases).toEqual([]);
});

test("a new merchant has its first transaction in the change month", () => {
  const result = changes({
    lines: [],
    merchants: [
      { merchantId: fuel, firstMonth: "2026-04" },
      { merchantId: dining, firstMonth: "2026-03" },
      { merchantId: groceries, firstMonth: "2026-04" },
      { merchantId: rent, firstMonth: "2026-05" },
    ],
  });
  expect(result.newMerchants).toEqual([{ merchantId: groceries }, { merchantId: fuel }]);
});

test("the savings rate is thousandths of a percent, and it is null when income is zero", () => {
  expect(savingsRateMilliPct(100_000, 25_000)).toBe(75_000);
  expect(savingsRateMilliPct(30, 10)).toBe(66_667);
  expect(savingsRateMilliPct(10_000, 15_000)).toBe(-50_000);
  expect(savingsRateMilliPct(0, 100)).toBeNull();
});
