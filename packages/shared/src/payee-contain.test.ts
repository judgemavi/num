import { expect, test } from "bun:test";
import { buildPayeeIndex, containedMatch } from "./payee-contain";

function match(payee: string, learned: string[], labels: Record<string, string> = {}) {
  return containedMatch(buildPayeeIndex(learned), payee, (name) => labels[name] ?? "same-label");
}

test("a learned payee at the start of the new payee is contained, with a city after it", () => {
  expect(match("COSTCO WHOLESALE W535 TORONTO", ["COSTCO WHOLESALE"])).toBe("COSTCO WHOLESALE");
  expect(match("PRESTO FARE", ["PRESTO"])).toBe("PRESTO");
});

test("a different first word never matches", () => {
  expect(match("SHELL GAS", ["COSTCO GAS"])).toBeNull();
  expect(match("COSTCO GAS", ["SHELL GAS"])).toBeNull();
});

test("a learned payee with more words than the new payee is not contained", () => {
  expect(match("COSTCO", ["COSTCO GAS"])).toBeNull();
});

test("the longest match wins", () => {
  const labels = { UBER: "ride", "UBER EATS": "food" };
  expect(match("UBER EATS TORONTO", ["UBER", "UBER EATS"], labels)).toBe("UBER EATS");
  expect(match("UBER TRIP", ["UBER", "UBER EATS"], labels)).toBe("UBER");
});

test("only the last word of the new payee may be cut, with 4 or more letters", () => {
  expect(match("COSTCO WHOLES", ["COSTCO WHOLESALE"])).toBe("COSTCO WHOLESALE");
  expect(match("COSTCO WHO", ["COSTCO WHOLESALE"])).toBeNull();
  expect(match("COSTCO WHOLES GAS", ["COSTCO WHOLESALE"])).toBeNull();
  expect(match("NOFRILL", ["NOFRILLS"])).toBeNull();
});

test("a first word that only starts with the learned word does not match", () => {
  expect(match("APPLEBEES", ["APPLE"])).toBeNull();
  expect(match("APPLEBEES GRILL", ["APPLE"])).toBeNull();
});

test("a repeated learned word must be repeated in the new payee", () => {
  expect(match("PIZZA HUT", ["PIZZA PIZZA"])).toBeNull();
  expect(match("PIZZA PIZZA TORONTO", ["PIZZA PIZZA"])).toBe("PIZZA PIZZA");
  expect(match("PIZZA HUT", ["PIZZA PIZZA", "PIZZA"])).toBe("PIZZA");
});

test("two equal candidates with different labels give no match and with the same label give one", () => {
  const learned = ["COSTCO WHOLESALE", "COSTCO GAS"];
  expect(match("COSTCO WHOLESALE GAS", learned, { "COSTCO WHOLESALE": "food", "COSTCO GAS": "fuel" })).toBeNull();
  expect(match("COSTCO WHOLESALE GAS", learned, { "COSTCO WHOLESALE": "food", "COSTCO GAS": "food" })).not.toBeNull();
});

test("a payee does not match itself", () => {
  expect(match("PRESTO", ["PRESTO"])).toBeNull();
});
