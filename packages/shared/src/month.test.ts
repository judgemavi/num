import { expect, test } from "bun:test";
import { buildMonthStory, type MonthStoryInput, type StoryLine } from "./month";

const groceries = "11111111-1111-4111-8111-111111111111";
const dining = "22222222-2222-4222-8222-222222222222";
const fuel = "33333333-3333-4333-8333-333333333333";
const rent = "44444444-4444-4444-8444-444444444444";
const travel = "55555555-5555-4555-8555-555555555555";
const gifts = "66666666-6666-4666-8666-666666666666";
const hobbies = "77777777-7777-4777-8777-777777777777";
const income = "88888888-8888-4888-8888-888888888888";

function line(month: string, amount: number, categoryId: string | null, kind: StoryLine["kind"], transfer = false): StoryLine {
  return { month, amount, categoryId, kind, transfer };
}

function story(input: Partial<MonthStoryInput> & Pick<MonthStoryInput, "lines">) {
  return buildMonthStory({
    month: "2026-04",
    asOf: "2026-04-30",
    merchants: [],
    occurrences: [],
    buckets: [],
    accuracy: null,
    ...input,
  });
}

test("the 3 largest changes use the median of the previous 3 months", () => {
  const months = ["2026-01", "2026-02", "2026-03"];
  const history: StoryLine[] = [];
  const series = [
    { id: groceries, prior: [100, 200, 300], current: 800 },
    { id: dining, prior: [50, 50, 50], current: 200 },
    { id: fuel, prior: [40, 40, 40], current: 160 },
    { id: rent, prior: [10, 10, 10], current: 80 },
    { id: travel, prior: [400, 400, 400], current: 100 },
    { id: gifts, prior: [300, 300, 300], current: 50 },
    { id: hobbies, prior: [200, 200, 200], current: 20 },
  ];
  for (const row of series) {
    months.forEach((month, index) => {
      history.push(line(month, -(row.prior[index] ?? 0), row.id, "expense"));
    });
    history.push(line("2026-04", -row.current, row.id, "expense"));
  }
  const result = story({ lines: history });
  expect(result.increases.map((row) => row.categoryId)).toEqual([groceries, dining, fuel]);
  expect(result.increases[0]).toMatchObject({ amount: 800, median: 200, delta: 600 });
  expect(result.decreases.map((row) => [row.categoryId, row.delta])).toEqual([
    [travel, -300],
    [gifts, -250],
    [hobbies, -180],
  ]);
  expect(result.increases.some((row) => row.categoryId === rent)).toBe(false);
});

test("the savings rate is thousandths of a percent, and it is empty when income is zero", () => {
  const withIncome = story({
    lines: [line("2026-04", 10_000, income, "income"), line("2026-04", -2_500, groceries, "expense")],
  });
  expect(withIncome.savings).toBe(7_500);
  expect(withIncome.savingsRateMilliPct).toBe(75_000);

  const rounded = story({
    lines: [line("2026-04", 3, income, "income"), line("2026-04", -1, groceries, "expense")],
  });
  expect(rounded.savingsRateMilliPct).toBe(66_667);

  const none = story({ lines: [line("2026-04", -100, groceries, "expense")] });
  expect(none.income).toBe(0);
  expect(none.savingsRateMilliPct).toBeNull();
});
