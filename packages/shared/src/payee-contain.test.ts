import { expect, test } from "bun:test";
import { buildPayeeIndex, containedMatch, familyMatch } from "./payee-contain";

function match(payee: string, learned: string[], labels: Record<string, string> = {}) {
  return containedMatch(buildPayeeIndex(learned), payee, (name) => labels[name] ?? "same-label");
}

test("a learned payee at the start of the new payee is contained, with a city after it", () => {
  expect(match("EXAMPLEMART WHOLESALE W909 EXAMPLEVILLE", ["EXAMPLEMART WHOLESALE"])).toBe("EXAMPLEMART WHOLESALE");
  expect(match("DEMOFARE FARE", ["DEMOFARE"])).toBe("DEMOFARE");
});

test("a different first word never matches", () => {
  expect(match("SHELL GAS", ["EXAMPLEMART GAS"])).toBeNull();
  expect(match("EXAMPLEMART GAS", ["SHELL GAS"])).toBeNull();
});

test("a learned payee with more words than the new payee is not contained", () => {
  expect(match("EXAMPLEMART", ["EXAMPLEMART GAS"])).toBeNull();
});

test("the longest match wins", () => {
  const labels = { UBER: "ride", "UBER EATS": "food" };
  expect(match("UBER EATS EXAMPLEVILLE", ["UBER", "UBER EATS"], labels)).toBe("UBER EATS");
  expect(match("UBER TRIP", ["UBER", "UBER EATS"], labels)).toBe("UBER");
});

test("only the last word of the new payee may be cut, with 4 or more letters", () => {
  expect(match("EXAMPLEMART WHOLES", ["EXAMPLEMART WHOLESALE"])).toBe("EXAMPLEMART WHOLESALE");
  expect(match("EXAMPLEMART WHO", ["EXAMPLEMART WHOLESALE"])).toBeNull();
  expect(match("EXAMPLEMART WHOLES GAS", ["EXAMPLEMART WHOLESALE"])).toBeNull();
  expect(match("NOFRILL", ["NOFRILLS"])).toBeNull();
});

test("a first word that only starts with the learned word does not match", () => {
  expect(match("APPLEBEES", ["APPLE"])).toBeNull();
  expect(match("APPLEBEES GRILL", ["APPLE"])).toBeNull();
});

test("a repeated learned word must be repeated in the new payee", () => {
  expect(match("PIZZA HUT", ["PIZZA PIZZA"])).toBeNull();
  expect(match("PIZZA PIZZA EXAMPLEVILLE", ["PIZZA PIZZA"])).toBe("PIZZA PIZZA");
  expect(match("PIZZA HUT", ["PIZZA PIZZA", "PIZZA"])).toBe("PIZZA");
});

test("two equal candidates with different labels give no match and with the same label give one", () => {
  const learned = ["EXAMPLEMART WHOLESALE", "EXAMPLEMART GAS"];
  expect(match("EXAMPLEMART WHOLESALE GAS", learned, { "EXAMPLEMART WHOLESALE": "food", "EXAMPLEMART GAS": "fuel" })).toBeNull();
  expect(match("EXAMPLEMART WHOLESALE GAS", learned, { "EXAMPLEMART WHOLESALE": "food", "EXAMPLEMART GAS": "food" })).not.toBeNull();
});

test("a payee does not match itself", () => {
  expect(match("DEMOFARE", ["DEMOFARE"])).toBeNull();
});

test("the brand family needs 2 or more learned payees that agree", () => {
  const family = (payee: string, learned: string[], labels: Record<string, string> = {}) =>
    familyMatch(buildPayeeIndex(learned), payee, (name) => labels[name] ?? "same");
  expect(family("DEMOFARE EAST STN", ["DEMOFARE NORTH STN", "DEMOFARE WEST STN"])).toEqual(["DEMOFARE NORTH STN", "DEMOFARE WEST STN"]);
  expect(family("DEMOFARE EAST STN", ["DEMOFARE WEST STN"])).toBeNull();
  expect(family("DEMOFARE EAST STN", ["DEMOFARE NORTH STN", "DEMOFARE WEST STN", "DEMOFARE LOAD"], { "DEMOFARE LOAD": "other" })).toBeNull();
  expect(family("EXAMPLEMART BUSINESS CENTRE", ["EXAMPLEMART WHOLESALE", "EXAMPLEMART GAS"], { "EXAMPLEMART WHOLESALE": "food", "EXAMPLEMART GAS": "fuel" })).toBeNull();
});
