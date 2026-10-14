import { expect, test } from "bun:test";
import { signedAmount } from "./amount-sign";

test("amount sign comes from the toggle", () => {
  expect(signedAmount("out", 12_500)).toBe(-12_500);
  expect(signedAmount("in", 12_500)).toBe(12_500);
  expect(signedAmount("out", 0)).toBe(0);
  expect(signedAmount("in", 0)).toBe(0);
});

test("a mixed-sign split reaches the signed total", () => {
  const total = signedAmount("out", 100_000);
  const assigned = signedAmount("out", 120_000) + signedAmount("in", 20_000);
  expect(assigned).toBe(-100_000);
  expect(total - assigned).toBe(0);
});
