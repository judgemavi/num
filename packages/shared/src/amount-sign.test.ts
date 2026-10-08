import { expect, test } from "bun:test";
import { signedAmount } from "./amount-sign";

test("amount sign comes from the toggle", () => {
  expect(signedAmount("out", 1_250)).toBe(-1_250);
  expect(signedAmount("in", 1_250)).toBe(1_250);
  expect(signedAmount("out", 0)).toBe(0);
  expect(signedAmount("in", 0)).toBe(0);
});
