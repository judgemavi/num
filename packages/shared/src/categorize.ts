import type { MoneyDirection } from "./amount-sign";
import type { CategoryKind } from "./category";
import type { Suggestion } from "./suggest";

export const whatChoices = ["spending", "income", "refund", "transfer", "split"] as const;

export type WhatChoice = (typeof whatChoices)[number];

export function choicesForDirection(direction: MoneyDirection, group = false): WhatChoice[] {
  const choices: WhatChoice[] = direction === "out" ? ["spending", "transfer", "split"] : ["income", "refund", "transfer", "split"];
  return group ? choices.filter((choice) => choice !== "split") : choices;
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

export function merchantForChoice(choice: WhatChoice, merchantId: string | null): string | null {
  return choice === "transfer" ? null : merchantId;
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
