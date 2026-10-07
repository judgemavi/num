import { expect, test } from "bun:test";
import { accountClass, accountKinds, defaultOnBudget, type AccountKind } from "./account";

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
