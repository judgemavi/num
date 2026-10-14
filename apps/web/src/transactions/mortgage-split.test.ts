import { describe, expect, test } from "bun:test";
import { fromMinorUnits } from "@num/shared";
import { mortgageSplitFill } from "./mortgage-split";

const text = (minor) => fromMinorUnits("CAD", minor);

const split = { payment: 150000, principal: 110000, interest: 40000, mortgageAccountId: "mortgage-1", interestCategoryId: "category-1" };

describe("mortgage split", () => {
  test("with no amount, the lines are the principal and the interest of the schedule, and the total is the payment", () => {
    const fill = mortgageSplitFill("CAD", split, "");
    expect(fill.total).toBe(text(150000));
    expect(fill.lines.map((line) => [line.amount, line.transferAccountId, line.categoryId])).toEqual([
      [text(110000), "mortgage-1", null],
      [text(40000), null, "category-1"],
    ]);
  });

  test("with an amount, the interest stays and the principal is the remainder", () => {
    const fill = mortgageSplitFill("CAD", split, " 1600 ");
    expect(fill.total).toBe(null);
    expect(fill.lines.map((line) => line.amount)).toEqual([text(120000), text(40000)]);
  });

  test("an amount that is not a number counts as no amount", () => {
    const fill = mortgageSplitFill("CAD", split, "abc");
    expect(fill.total).toBe(text(150000));
    expect(fill.lines.map((line) => line.amount)).toEqual([text(110000), text(40000)]);
  });
});
