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
  expect(balanceFromEntry("mortgage", 506_488_660)).toBe(-506_488_660);
  expect(entryFromBalance("mortgage", -506_488_660)).toBe(506_488_660);
  expect(balanceFromEntry("credit_card", 0)).toBe(0);
  expect(balanceFromEntry("chequing", 12_000)).toBe(12_000);
  expect(entryFromBalance("chequing", -3000)).toBe(-3000);
});

test("net worth counts a negative card and a negative mortgage as owed", () => {
  const result = netWorthOf([
    { kind: "chequing", balance: 1_000_000 },
    { kind: "credit_card", balance: -1_073_680 },
    { kind: "credit_card", balance: -50_000 },
    { kind: "mortgage", balance: -506_488_660 },
  ]);
  expect(result).toEqual({ have: 1_000_000, owe: 507_612_340, net: -506_612_340 });
});

test("a card in credit counts as money you have", () => {
  expect(netWorthOf([{ kind: "credit_card", balance: 25_000 }])).toEqual({ have: 25_000, owe: 0, net: 25_000 });
});

test("a principal payment lowers the amount owed on a mortgage", () => {
  const before = netWorthOf([{ kind: "mortgage", balance: -500_000_000 }]);
  const after = netWorthOf([{ kind: "mortgage", balance: -500_000_000 + 1_200_000 }]);
  expect(after.owe).toBe(before.owe - 1_200_000);
});
