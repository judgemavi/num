import { describe, expect, test } from "bun:test";
import { amountText } from "@num/shared";
import { mortgageSplitFill } from "./mortgage-split";

const split = { payment: 1_500_000, principal: 1_100_000, interest: 400_000, mortgageAccountId: "mortgage-1", interestCategoryId: "category-1" };

describe("mortgage split", () => {
  test("with no amount, the lines are the principal and the interest of the schedule, and the total is the payment", () => {
    const fill = mortgageSplitFill("CAD", split, "");
    expect(fill.total).toBe(amountText(1_500_000));
    expect(fill.lines.map((line) => [line.amount, line.transferAccountId, line.categoryId])).toEqual([
      [amountText(1_100_000), "mortgage-1", null],
      [amountText(400_000), null, "category-1"],
    ]);
  });

  test("with an amount, the interest stays and the principal is the remainder", () => {
    const fill = mortgageSplitFill("CAD", split, " 1600 ");
    expect(fill.total).toBe(null);
    expect(fill.lines.map((line) => line.amount)).toEqual([amountText(1_200_000), amountText(400_000)]);
  });

  test("an amount that is not a number counts as no amount", () => {
    const fill = mortgageSplitFill("CAD", split, "abc");
    expect(fill.total).toBe(amountText(1_500_000));
    expect(fill.lines.map((line) => line.amount)).toEqual([amountText(1_100_000), amountText(400_000)]);
  });
});
