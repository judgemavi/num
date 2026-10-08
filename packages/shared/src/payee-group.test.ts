import { expect, test } from "bun:test";
import { groupByPayee, uncategorizedItemKey, type PayeeGroupRow } from "./payee-group";
import type { Suggestion } from "./suggest";

const food: Suggestion = {
  merchantId: null,
  categoryId: "11111111-1111-4111-8111-111111111111",
  transferAccountId: null,
  reason: "payee_history",
};
const none: Suggestion = { merchantId: null, categoryId: null, transferAccountId: null, reason: "none" };

function row(id: string, payee: string, date: string, amount: number, suggestion: Suggestion = none): PayeeGroupRow {
  return { transactionId: id, date, amount, payeeRaw: payee.toLowerCase(), payee, suggestion };
}

test("groupByPayee puts one payee in one item", () => {
  const first = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const second = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const other = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const groups = groupByPayee([
    row(second, "BLUE BOTTLE", "2026-03-02", -420, food),
    row(first, "BLUE BOTTLE", "2026-03-01", -400, food),
    row(other, "SHELL", "2026-03-04", -2000),
  ]);
  const bottle = groups.find((group) => group.payee === "BLUE BOTTLE");
  expect(bottle).toEqual({
    payee: "BLUE BOTTLE",
    payeeRaw: "blue bottle",
    date: "2026-03-02",
    count: 2,
    total: -820,
    transactionIds: [second, first],
    suggestion: food,
  });
  expect(uncategorizedItemKey("BLUE BOTTLE")).toBe("uncategorized:BLUE BOTTLE");
  expect(groups.find((group) => group.payee === "SHELL")?.count).toBe(1);
});
