import { expect, test } from "bun:test";
import { signedAmount } from "./amount-sign";

test("amount sign comes from the toggle", () => {
  expect(signedAmount("out", 1_250)).toBe(-1_250);
  expect(signedAmount("in", 1_250)).toBe(1_250);
  expect(signedAmount("out", 0)).toBe(0);
  expect(signedAmount("in", 0)).toBe(0);
});

test("a mixed-sign split reaches the signed total", () => {
  const total = signedAmount("out", 10_000);
  const assigned = signedAmount("out", 12_000) + signedAmount("in", 2_000);
  expect(assigned).toBe(-10_000);
  expect(total - assigned).toBe(0);
});
