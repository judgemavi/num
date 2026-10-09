import { describe, expect, test } from "bun:test";
import { canOfferInlineCreate, finishInlineCreate } from "./inline-create";

describe("inline create", () => {
  test("a new category is selected and the form closes", () => {
    expect(finishInlineCreate(null, "6b1e0c4a-1111-4222-8333-444455556666")).toEqual({
      expanded: false,
      selectedId: "6b1e0c4a-1111-4222-8333-444455556666",
    });
  });

  test("cancel keeps the current category and closes the form", () => {
    expect(finishInlineCreate("6b1e0c4a-1111-4222-8333-444455556666", null)).toEqual({
      expanded: false,
      selectedId: "6b1e0c4a-1111-4222-8333-444455556666",
    });
  });

  test("a category form can open a group, and that group cannot open another form", () => {
    expect(canOfferInlineCreate(0)).toBe(true);
    expect(canOfferInlineCreate(1)).toBe(true);
    expect(canOfferInlineCreate(2)).toBe(false);
  });
});
