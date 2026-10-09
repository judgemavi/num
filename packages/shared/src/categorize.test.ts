import { expect, test } from "bun:test";
import {
  categoryKindForChoice,
  choicesForDirection,
  defaultChoice,
  merchantForChoice,
  merchantNameFromPayee,
  preselectTransfer,
  resolveEditorChoice,
  type Suggestion,
} from "./index";

const none: Suggestion = { merchantId: null, categoryId: null, transferAccountId: null, reason: "none", sure: false, sourceId: null, confidence: 0 };
const coffee = "11111111-1111-4111-8111-111111111111";
const merchant = "22222222-2222-4222-8222-222222222222";
const savings = "33333333-3333-4333-8333-333333333333";

test("direction sets the default choice", () => {
  expect(defaultChoice("out")).toBe("spending");
  expect(defaultChoice("in")).toBe("income");
  expect(choicesForDirection("out")).toEqual(["spending", "transfer", "split"]);
  expect(choicesForDirection("in")).toEqual(["income", "refund", "transfer", "split"]);
  expect(choicesForDirection("out", true)).toEqual(["spending", "transfer"]);
  expect(resolveEditorChoice({
    direction: "out",
    suggestion: none,
    categoryKind: null,
    transferAccountFromRule: null,
    oppositeAccountId: null,
  }).choice).toBe("spending");
  expect(resolveEditorChoice({
    direction: "in",
    suggestion: none,
    categoryKind: null,
    transferAccountFromRule: null,
    oppositeAccountId: null,
  }).choice).toBe("income");
});

test("transfer is preselected only on evidence", () => {
  expect(preselectTransfer({ transferRule: false, oppositeMatch: false })).toBe(false);
  expect(preselectTransfer({ transferRule: true, oppositeMatch: false })).toBe(true);
  expect(preselectTransfer({ transferRule: false, oppositeMatch: true })).toBe(true);
  const category: Suggestion = { merchantId: merchant, categoryId: coffee, transferAccountId: null, reason: "learned_payee", sure: false, sourceId: null, confidence: 700 };
  const fromHistory = resolveEditorChoice({
    direction: "out",
    suggestion: category,
    categoryKind: "expense",
    transferAccountFromRule: null,
    oppositeAccountId: null,
  });
  expect(fromHistory.choice).toBe("spending");
  expect(fromHistory.transferAccountId).toBeNull();
  const fromRule = resolveEditorChoice({
    direction: "out",
    suggestion: { merchantId: null, categoryId: null, transferAccountId: savings, reason: "learned_payee", sure: false, sourceId: null, confidence: 700 },
    categoryKind: null,
    transferAccountFromRule: savings,
    oppositeAccountId: null,
  });
  expect(fromRule.choice).toBe("transfer");
  expect(fromRule.transferAccountId).toBe(savings);
  expect(fromRule.merchantId).toBeNull();
  const fromMatch = resolveEditorChoice({
    direction: "in",
    suggestion: none,
    categoryKind: null,
    transferAccountFromRule: null,
    oppositeAccountId: savings,
  });
  expect(fromMatch.choice).toBe("transfer");
  expect(fromMatch.transferAccountId).toBe(savings);
});

test("a transfer clears the merchant", () => {
  expect(merchantForChoice("transfer", merchant)).toBeNull();
  expect(merchantForChoice("spending", merchant)).toBe(merchant);
  expect(merchantForChoice("income", merchant)).toBe(merchant);
  expect(merchantForChoice("refund", null)).toBeNull();
});

test("the category kind follows the choice", () => {
  expect(categoryKindForChoice("spending")).toBe("expense");
  expect(categoryKindForChoice("refund")).toBe("expense");
  expect(categoryKindForChoice("income")).toBe("income");
  expect(categoryKindForChoice("transfer")).toBeNull();
  expect(categoryKindForChoice("split")).toBeNull();
  const refund = resolveEditorChoice({
    direction: "in",
    suggestion: { merchantId: merchant, categoryId: coffee, transferAccountId: null, reason: "learned_payee", sure: false, sourceId: null, confidence: 700 },
    categoryKind: "expense",
    transferAccountFromRule: null,
    oppositeAccountId: null,
  });
  expect(refund.choice).toBe("refund");
  expect(refund.categoryId).toBe(coffee);
  const incomeOnOut = resolveEditorChoice({
    direction: "out",
    suggestion: { merchantId: null, categoryId: coffee, transferAccountId: null, reason: "merchant_default", sure: false, sourceId: null, confidence: 600 },
    categoryKind: "income",
    transferAccountFromRule: null,
    oppositeAccountId: null,
  });
  expect(incomeOnOut.choice).toBe("spending");
  expect(incomeOnOut.categoryId).toBeNull();
});

test("merchant name comes from the payee", () => {
  expect(merchantNameFromPayee("SQ *BLUE BOTTLE 0423")).toBe("Blue Bottle");
  expect(merchantNameFromPayee("sq *  blue bottle")).toBe("Blue Bottle");
  expect(merchantNameFromPayee("POS 0423")).toBe("");
});
