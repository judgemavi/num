import { expect, test } from "bun:test";
import { accountClass, accountKinds, balanceFromEntry, defaultOnBudget, entryFromBalance, netWorthOf, type AccountKind } from "./account";

const liabilities = ["credit_card", "mortgage", "loan", "other_liability"] as const;

test("the kind sets the class", () => {
  for (const kind of accountKinds) {
    const expected = liabilities.includes(kind as (typeof liabilities)[number]) ? "liability" : "asset";
    expect(accountClass(kind)).toBe(expected);
  }
});

test("onBudget defaults to true for cash accounts and credit cards", () => {
  const onBudget = new Set<AccountKind>(["chequing", "savings", "cash", "credit_card"]);
  for (const kind of accountKinds) {
    expect(defaultOnBudget(kind)).toBe(onBudget.has(kind));
  }
});

test("an amount owed on a liability is stored negative and round-trips", () => {
  expect(balanceFromEntry("mortgage", 50648866)).toBe(-50648866);
  expect(entryFromBalance("mortgage", -50648866)).toBe(50648866);
  expect(balanceFromEntry("credit_card", 0)).toBe(0);
  expect(balanceFromEntry("chequing", 1200)).toBe(1200);
  expect(entryFromBalance("chequing", -300)).toBe(-300);
});

test("net worth counts a negative card and a negative mortgage as owed", () => {
  const result = netWorthOf([
    { kind: "chequing", balance: 100000 },
    { kind: "credit_card", balance: -107368 },
    { kind: "credit_card", balance: -5000 },
    { kind: "mortgage", balance: -50648866 },
  ]);
  expect(result).toEqual({ have: 100000, owe: 50761234, net: -50661234 });
});

test("a card in credit counts as money you have", () => {
  expect(netWorthOf([{ kind: "credit_card", balance: 2500 }])).toEqual({ have: 2500, owe: 0, net: 2500 });
});

test("a principal payment lowers the amount owed on a mortgage", () => {
  const before = netWorthOf([{ kind: "mortgage", balance: -50000000 }]);
  const after = netWorthOf([{ kind: "mortgage", balance: -50000000 + 120000 }]);
  expect(after.owe).toBe(before.owe - 120000);
});
