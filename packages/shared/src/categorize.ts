import { isEverydayKind, type AccountKind } from "./account";
import type { MoneyDirection } from "./amount-sign";
import type { CategoryKind } from "./category";
import type { Suggestion } from "./suggest";

export const whatChoices = ["spending", "income", "refund", "transfer", "loan_payment"] as const;

export type WhatChoice = (typeof whatChoices)[number];

export function choicesForDirection(direction: MoneyDirection): WhatChoice[] {
  return direction === "out" ? ["spending", "transfer", "loan_payment"] : ["income", "refund", "transfer"];
}

/** The type gives the sign: Spending and Loan payment are money out, Income and Refund are money in. A transfer has two sides: null. */
export function choiceDirection(choice: WhatChoice): MoneyDirection | null {
  if (choice === "spending" || choice === "loan_payment") {
    return "out";
  }
  return choice === "transfer" ? null : "in";
}

/** The accounts that a manual transaction of a type can use. A transfer can use every account. */
export function accountFitsChoice(choice: WhatChoice, kind: AccountKind): boolean {
  return choice === "transfer" || isEverydayKind(kind);
}

export function defaultChoice(direction: MoneyDirection): WhatChoice {
  return direction === "out" ? "spending" : "income";
}

export function categoryKindForChoice(choice: WhatChoice): CategoryKind | null {
  if (choice === "income") {
    return "income";
  }
  if (choice === "spending" || choice === "refund") {
    return "expense";
  }
  return null;
}

/** Transfer is preselected only when a transfer rule or an opposite match says so. */
export function preselectTransfer(input: { transferRule: boolean; oppositeMatch: boolean }): boolean {
  return input.transferRule || input.oppositeMatch;
}

/** A transfer and a loan payment have no merchant. */
export function merchantForChoice(choice: WhatChoice, merchantId: string | null): string | null {
  return choice === "transfer" || choice === "loan_payment" ? null : merchantId;
}

export function choiceForCategory(direction: MoneyDirection, kind: CategoryKind | null): WhatChoice {
  if (direction === "in" && kind === "expense") {
    return "refund";
  }
  if (direction === "in" && kind === "income") {
    return "income";
  }
  return defaultChoice(direction);
}

export function resolveEditorChoice(input: {
  direction: MoneyDirection;
  suggestion: Suggestion | null;
  categoryKind: CategoryKind | null;
  transferAccountFromRule: string | null;
  oppositeAccountId: string | null;
}): { choice: WhatChoice; categoryId: string | null; transferAccountId: string | null; merchantId: string | null } {
  const transferFromRule = input.transferAccountFromRule;
  // The learned mortgage payment is a loan payment to the mortgage.
  if (input.suggestion?.mortgage && input.suggestion.transferAccountId && input.direction === "out") {
    return { choice: "loan_payment", categoryId: null, transferAccountId: input.suggestion.transferAccountId, merchantId: null };
  }
  if (preselectTransfer({ transferRule: transferFromRule !== null, oppositeMatch: input.oppositeAccountId !== null })) {
    return {
      choice: "transfer",
      categoryId: null,
      transferAccountId: transferFromRule ?? input.oppositeAccountId,
      merchantId: null,
    };
  }
  const suggestion = input.suggestion;
  const choice = suggestion?.categoryId ? choiceForCategory(input.direction, input.categoryKind) : defaultChoice(input.direction);
  const wanted = categoryKindForChoice(choice);
  const categoryFits = suggestion?.categoryId !== null && suggestion?.categoryId !== undefined && wanted !== null && wanted === input.categoryKind;
  return {
    choice,
    categoryId: categoryFits ? suggestion.categoryId : null,
    transferAccountId: null,
    merchantId: merchantForChoice(choice, suggestion?.merchantId ?? null),
  };
}
