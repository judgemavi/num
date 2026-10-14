import { expect, test } from "bun:test";
import { bandContains, fitLabels, labelScores, learnedLabels, widthFactor, type BandRow } from "./amount-band";
import { learnedConfidence, scoreMatch, type ConfidenceMode } from "./matching";

function row(id: string, date: string, categoryId: string, amount: number): BandRow {
  return { id, date, categoryId, merchantId: null, amount };
}

function score(rows: readonly BandRow[], amount: number, mode: ConfidenceMode = "balanced") {
  return scoreMatch({
    mode,
    recurring: null,
    amountScores: labelScores(fitLabels(learnedLabels(rows), amount)),
    payeeScores: learnedConfidence(rows),
    similar: null,
    transferRows: [],
  });
}

test("a band with one amount is that amount ±1%", () => {
  const [label] = learnedLabels([row("a", "2026-01-01", "rent", -100000)]);
  expect(label?.factor).toBe(1);
  expect(label && bandContains(label, -101000)).toBe(true);
  expect(label && bandContains(label, -101001)).toBe(false);
  expect(label && bandContains(label, -99000)).toBe(true);
  expect(label && bandContains(label, -98999)).toBe(false);
});

test("a band with two or more amounts is from the lowest − 1% to the highest + 1%", () => {
  const [label] = learnedLabels([row("a", "2026-01-15", "pay", 534985), row("b", "2026-01-31", "pay", 644571)]);
  expect(label?.low).toBe(534985);
  expect(label?.high).toBe(644571);
  expect(label && bandContains(label, 529636)).toBe(true);
  expect(label && bandContains(label, 529635)).toBe(false);
  expect(label && bandContains(label, 651016)).toBe(true);
  expect(label && bandContains(label, 651017)).toBe(false);
  expect(label?.factor).toBeCloseTo(1 - 0.05 * ((644571 - 534985) / 644571 / 0.5), 10);
  expect(score([row("a", "2026-01-15", "pay", 534985), row("b", "2026-01-31", "pay", 644571)], 590000).confidenceMilli).toBe(895);
});

test("only the newest 6 amounts make the band", () => {
  const rows = [
    row("old", "2026-01-01", "phone", -100000),
    ...[1000, 1100, 1200, 1300, 1400, 1500].map((amount, index) => row(`r${index}`, `2026-02-0${index + 1}`, "phone", -amount)),
  ];
  const [label] = learnedLabels(rows);
  expect(label?.low).toBe(1000);
  expect(label?.high).toBe(1500);
  expect(label?.rows).toHaveLength(7);
  expect(fitLabels(learnedLabels(rows), -100000)).toEqual([]);
});

test("the width factor is 1 at width 0, 0.975 at 0.25 and 0.95 from 0.5", () => {
  expect(widthFactor(1000, 1000)).toBe(1);
  expect(widthFactor(750, 1000)).toBeCloseTo(0.975, 10);
  expect(widthFactor(500, 1000)).toBeCloseTo(0.95, 10);
  expect(widthFactor(100, 1000)).toBeCloseTo(0.95, 10);
  expect(widthFactor(0, 0)).toBe(1);
});

test("an amount outside all bands uses only the payee signal", () => {
  const rows = [row("a", "2026-01-01", "pay", 534985), row("b", "2026-01-31", "pay", 644571)];
  expect(fitLabels(learnedLabels(rows), 700000)).toEqual([]);
  const result = score(rows, 700000);
  expect(result.reason).toBe("learned_payee");
  expect(result.confidence).toBeCloseTo(0.91 * 0.95, 10);
  expect(result.level).toBe("automatic");
});

test("two labels of one payee with separate bands each win in their band", () => {
  const subscriptions = ["01", "02", "03", "04"].map((month) => row(`s${month}`, `2026-${month}-05`, "subscriptions", -999));
  const shopping = [1250, 4000, 8000, 15000, 24000].map((amount, index) => row(`p${index}`, `2026-0${index + 1}-20`, "shopping", -amount));
  const rows = [...subscriptions, ...shopping];
  const subscription = score(rows, -999);
  expect(subscription.categoryId).toBe("subscriptions");
  expect(subscription.reason).toBe("learned_amount");
  const purchase = score(rows, -8000);
  expect(purchase.categoryId).toBe("shopping");
  expect(purchase.reason).toBe("learned_amount");
});

test("payee + amount and payee for one candidate give the higher value, not the combined value", () => {
  const rows = [row("a", "2026-01-01", "rent", -200000)];
  const result = score(rows, -200000);
  expect(result.signals.map((signal) => signal.reason)).toEqual(["learned_amount", "learned_payee"]);
  expect(result.confidence).toBeCloseTo(0.85, 10);
  expect(result.confidenceMilli).toBe(850);
  expect(result.reason).toBe("learned_amount");
  expect(score(rows, -150000).confidenceMilli).toBe(808);
});

test("one answer at the same amount is automatic with Balanced and a suggestion with Careful", () => {
  const rows = [row("a", "2026-01-01", "rent", -200000)];
  expect(score(rows, -200000, "balanced").level).toBe("automatic");
  expect(score(rows, -200000, "careful").level).toBe("suggestion");
});
