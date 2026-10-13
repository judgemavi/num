import { expect, test } from "bun:test";
import { buildPayeeIndex, containedMatch, noiseWords } from "./payee-contain";

const cities = ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO"];
const cityPayees = cities.map((name) => `${name} TORONTO`);
const everyPayee = [...cityPayees, "COSTCO WHOLESALE", "COSTCO GAS", "PRESTO", "UBER", "UBER EATS", "TORONTO HYDRO", "NOFRILLS", "SHELL GAS"];

function match(payee: string, learned: string[], labels: Record<string, string> = {}, all: string[] = everyPayee) {
  const index = buildPayeeIndex(noiseWords([...all, ...learned]), learned);
  return containedMatch(index, payee, (name) => labels[name] ?? "same-label");
}

test("a word that follows 5 different first words is noise and one that follows 4 is not", () => {
  expect(noiseWords([...cities.map((name) => `${name} OTTAWA`)]).has("OTTAWA")).toBe(true);
  expect(noiseWords(cities.slice(0, 4).map((name) => `${name} OTTAWA`)).has("OTTAWA")).toBe(false);
});

test("a word that is a first word of any payee is never noise", () => {
  expect(noiseWords(everyPayee).has("TORONTO")).toBe(false);
});

test("a word after only one merchant is not noise", () => {
  const noise = noiseWords(["UBER EATS", "UBER EATS", "UBER TRIP", "LYFT RIDE"]);
  expect(noise.has("EATS")).toBe(false);
});

test("a city word as noise gives the same payee", () => {
  const noise = noiseWords([...cities.map((name) => `${name} TORONTO`), "COSTCO WHOLESALE"]);
  expect(noise.has("TORONTO")).toBe(true);
  expect(match("COSTCO WHOLESALE TORONTO", ["COSTCO WHOLESALE"], {}, [...cities.map((name) => `${name} TORONTO`)])).toEqual({
    kind: "same",
    payee: "COSTCO WHOLESALE",
  });
});

test("a sub-brand is a similar payee and a payee with no extra word is the same payee", () => {
  const all = [...cities.map((name) => `${name} TORONTO`)];
  expect(match("PRESTO FARE TORONTO", ["PRESTO"], {}, all)).toEqual({ kind: "similar", payee: "PRESTO" });
  expect(match("PRESTO TORONTO", ["PRESTO"], {}, all)).toEqual({ kind: "same", payee: "PRESTO" });
});

test("a different first word never matches", () => {
  expect(match("SHELL GAS", ["COSTCO GAS"])).toBeNull();
  expect(match("COSTCO GAS", ["SHELL GAS"])).toBeNull();
});

test("the longest match wins", () => {
  expect(match("UBER EATS TORONTO", ["UBER", "UBER EATS"], { UBER: "ride", "UBER EATS": "food" }, cityPayees)).toEqual({
    kind: "same",
    payee: "UBER EATS",
  });
  expect(match("UBER TRIP", ["UBER", "UBER EATS"], { UBER: "ride", "UBER EATS": "food" })).toEqual({ kind: "similar", payee: "UBER" });
});

test("a cut first word or a cut last word matches", () => {
  expect(match("NOFRILL", ["NOFRILLS"])).toEqual({ kind: "same", payee: "NOFRILLS" });
  expect(match("NOFRILLS", ["NOFRILL"])).toEqual({ kind: "same", payee: "NOFRILL" });
  expect(match("COSTCO WHOLESAL", ["COSTCO WHOLESALE"])).toEqual({ kind: "same", payee: "COSTCO WHOLESALE" });
  expect(match("COSTCO WHOLESALE W535", ["COSTCO WHOLESAL"])).toEqual({ kind: "similar", payee: "COSTCO WHOLESAL" });
  expect(match("ABC", ["ABCD"])).toBeNull();
});

test("two equal candidates with different labels give no match and with the same label give one", () => {
  const learned = ["COSTCO WHOLESALE", "COSTCO GAS"];
  expect(match("COSTCO WHOLESALE GAS", learned, { "COSTCO WHOLESALE": "food", "COSTCO GAS": "fuel" })).toBeNull();
  expect(match("COSTCO WHOLESALE GAS", learned, { "COSTCO WHOLESALE": "food", "COSTCO GAS": "food" })).not.toBeNull();
});

test("a city word that is also a first word keeps its anchor", () => {
  expect(match("TORONTO HYDRO BILL", ["TORONTO HYDRO"])).toEqual({ kind: "similar", payee: "TORONTO HYDRO" });
  expect(match("TORONTO TRANSIT", ["TORONTO HYDRO"])).toBeNull();
});

test("a word after fewer than 5 first words is not noise", () => {
  const all = cities.slice(0, 4).map((name) => `${name} TORONTO`);
  expect(match("PRESTO TORONTO", ["PRESTO"], {}, all)).toEqual({ kind: "similar", payee: "PRESTO" });
});

test("a payee does not match itself", () => {
  expect(match("PRESTO", ["PRESTO"])).toBeNull();
});
