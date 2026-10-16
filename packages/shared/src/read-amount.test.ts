import { expect, test } from "bun:test";
import { parseAmount } from "./currency";
import { readAmount } from "./read-amount";

test("typed and statement amounts keep zero positive", () => {
  expect(Object.is(parseAmount("CAD", "-0.00"), 0)).toBe(true);
  const result = readAmount("(0.00)", 2, ".");
  expect(result).toEqual({ kind: "value", amount: 0 });
});

test("statement amounts accept currency symbols and reject masked account numbers", () => {
  expect(readAmount("₹12.34", 2, ".")).toEqual({ kind: "value", amount: 12_340 });
  expect(readAmount("****1234", 2, ".")).toEqual({ kind: "error", reason: "amount_unreadable" });
});

test("typed and statement amounts share the safe integer boundary", () => {
  expect(parseAmount("KWD", "9007199254740.991")).toBe(Number.MAX_SAFE_INTEGER);
  expect(readAmount("9007199254740.991", 3, ".")).toEqual({ kind: "value", amount: Number.MAX_SAFE_INTEGER });
  expect(() => parseAmount("KWD", "9007199254740.992")).toThrow("Amount is too large");
  expect(readAmount("9007199254740.992", 3, ".")).toEqual({ kind: "error", reason: "amount_too_large" });
});
