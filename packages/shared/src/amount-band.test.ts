import { expect, test } from "bun:test";
import { bandContains, fitLabels, labelScores, learnedLabels, widthFactor, type BandRow } from "./amount-band";
import { learnedConfidence, scoreMatch, type RecurringSignal } from "./matching";

function row(id: string, date: string, categoryId: string, amount: number): BandRow {
  return { id, date, categoryId, merchantId: null, amount };
}

function score(rows: readonly BandRow[], amount: number, recurring: RecurringSignal | null = null) {
  const labels = learnedLabels(rows);
  const fit = fitLabels(labels, amount);
  return scoreMatch({
    recurring,
    amountScores: labelScores(fit),
    payeeScores: learnedConfidence(rows),
    similar: null,
    transferRows: [],
    outsideBands: labels.length > 0 && fit.length === 0,
  });
}

test("a band with one amount is that amount ±1%", () => {
  const [label] = learnedLabels([row("a", "2026-01-01", "rent", -1000000)]);
  expect(label?.factor).toBe(1);
  expect(label && bandContains(label, -1010000)).toBe(true);
  expect(label && bandContains(label, -1010001)).toBe(false);
  expect(label && bandContains(label, -990000)).toBe(true);
  expect(label && bandContains(label, -989999)).toBe(false);
});

test("a band with two or more amounts is from the lowest − 1% to the highest + 1%", () => {
  const [label] = learnedLabels([row("a", "2026-01-15", "pay", 5349850), row("b", "2026-01-31", "pay", 6445710)]);
  expect(label?.low).toBe(5349850);
  expect(label?.high).toBe(6445710);
  expect(label && bandContains(label, 5296352)).toBe(true);
  expect(label && bandContains(label, 5296351)).toBe(false);
  expect(label && bandContains(label, 6510167)).toBe(true);
  expect(label && bandContains(label, 6510168)).toBe(false);
  expect(label?.factor).toBeCloseTo(1 - 0.05 * ((6445710 - 5349850) / 6445710 / 0.5), 10);
  expect(score([row("a", "2026-01-15", "pay", 5349850), row("b", "2026-01-31", "pay", 6445710)], 5900000).confidenceMilli).toBe(895);
});

test("only the newest 6 amounts make the band", () => {
  const rows = [
    row("old", "2026-01-01", "phone", -1000000),
    ...[10000, 11000, 12000, 13000, 14000, 15000].map((amount, index) => row(`r${index}`, `2026-02-0${index + 1}`, "phone", -amount)),
  ];
  const [label] = learnedLabels(rows);
  expect(label?.low).toBe(10000);
  expect(label?.high).toBe(15000);
  expect(label?.rows).toHaveLength(7);
  expect(fitLabels(learnedLabels(rows), -1000000)).toEqual([]);
});

test("the width factor is 1 at width 0, 0.975 at 0.25 and 0.95 from 0.5", () => {
  expect(widthFactor(1000, 1000)).toBe(1);
  expect(widthFactor(750, 1000)).toBeCloseTo(0.975, 10);
  expect(widthFactor(500, 1000)).toBeCloseTo(0.95, 10);
  expect(widthFactor(100, 1000)).toBeCloseTo(0.95, 10);
  expect(widthFactor(0, 0)).toBe(1);
});

test("an amount outside all bands uses only the payee signal and is not automatic", () => {
  const rows = [row("a", "2026-01-01", "pay", 5349850), row("b", "2026-01-31", "pay", 6445710)];
  expect(fitLabels(learnedLabels(rows), 7000000)).toEqual([]);
  const result = score(rows, 7000000);
  expect(result.reason).toBe("learned_payee");
  expect(result.confidence).toBeCloseTo(0.91 * 0.95, 10);
  expect(result.level).toBe("suggestion");
  expect(score(rows, 6000000).level).toBe("automatic");
});

test("an amount outside all bands of many confirmations is a suggestion, not automatic (decision 0043)", () => {
  const rent = ["01", "02", "03", "04", "05", "06", "07"].map((month) => row(`r${month}`, `2026-${month}-01`, "rent", -2550000));
  for (const amount of [-15000, -1500000, -2000000]) {
    const result = score(rent, amount);
    expect(result.categoryId).toBe("rent");
    expect(result.confidenceMilli).toBeGreaterThanOrEqual(850);
    expect(result.level).toBe("suggestion");
  }
  expect(score(rent, -2550000).level).toBe("automatic");
});

test("a key with no learned labels does not change", () => {
  const result = score([], -15000);
  expect(result.level).toBe("none");
  const transfer = scoreMatch({
    recurring: null,
    amountScores: [],
    payeeScores: [],
    similar: null,
    transferRows: [{ id: "t", date: "2026-01-01", transferAccountId: "savings" }],
    outsideBands: false,
  });
  expect(transfer.transferAccountId).toBe("savings");
  expect(transfer.level).toBe("suggestion");
});

test("a recurring link is automatic when no band contains the amount", () => {
  const rows = [row("a", "2026-01-01", "rent", -2550000), row("b", "2026-02-01", "rent", -2550000)];
  const recurring = { planId: "plan", categoryId: "rent", merchantId: null, transferAccountId: null, mortgage: false };
  const result = score(rows, -2000000, recurring);
  expect(result.reason).toBe("recurring");
  expect(result.level).toBe("automatic");
});

test("two labels of one payee with separate bands each win in their band", () => {
  const subscriptions = ["01", "02", "03", "04"].map((month) => row(`s${month}`, `2026-${month}-05`, "subscriptions", -9990));
  const shopping = [12500, 40000, 80000, 150000, 240000].map((amount, index) => row(`p${index}`, `2026-0${index + 1}-20`, "shopping", -amount));
  const rows = [...subscriptions, ...shopping];
  const subscription = score(rows, -9990);
  expect(subscription.categoryId).toBe("subscriptions");
  expect(subscription.reason).toBe("learned_amount");
  const purchase = score(rows, -80000);
  expect(purchase.categoryId).toBe("shopping");
  expect(purchase.reason).toBe("learned_amount");
});

test("payee + amount and payee for one candidate give the higher value, not the combined value", () => {
  const rows = [row("a", "2026-01-01", "rent", -2000000)];
  const result = score(rows, -2000000);
  expect(result.signals.map((signal) => signal.reason)).toEqual(["learned_amount", "learned_payee"]);
  expect(result.confidence).toBeCloseTo(0.85, 10);
  expect(result.confidenceMilli).toBe(850);
  expect(result.reason).toBe("learned_amount");
  expect(score(rows, -1500000).confidenceMilli).toBe(808);
});

test("one answer at the same amount is automatic at the fixed threshold (850)", () => {
  const rows = [row("a", "2026-01-01", "rent", -2000000)];
  expect(score(rows, -2000000).level).toBe("automatic");
  expect(score(rows, -1500000).level).toBe("suggestion");
});
