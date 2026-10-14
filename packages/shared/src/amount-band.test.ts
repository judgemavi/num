import { expect, test } from "bun:test";
import { bandContains, bandSignals, fitLabels, learnedLabels, widthFactor, type BandRow } from "./amount-band";
import { learnedConfidence, scoreMatch, type RecurringSignal } from "./matching";

function row(id: string, date: string, categoryId: string, amount: number, merchantId: string | null = null): BandRow {
  return { id, date, categoryId, merchantId, amount };
}

function signals(rows: readonly BandRow[], amount: number) {
  const labels = learnedLabels(rows);
  return bandSignals(labels, fitLabels(labels, amount), learnedConfidence(rows));
}

function score(rows: readonly BandRow[], amount: number, recurring: RecurringSignal | null = null) {
  return scoreMatch({ ...signals(rows, amount), recurring, similar: null, transferRows: [] });
}

/** Rows of one label, one each month from the start month, oldest first. */
function monthly(prefix: string, start: number, categoryId: string, amounts: readonly number[], merchantId: string | null = null) {
  return amounts.map((amount, index) => {
    const month = start + index;
    const date = `${2025 + Math.floor((month - 1) / 12)}-${String(((month - 1) % 12) + 1).padStart(2, "0")}-01`;
    return row(`${prefix}${index}`, date, categoryId, amount, merchantId);
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

test("one category: an amount outside the band uses the payee signal and is automatic (decision 0044)", () => {
  const rows = [row("a", "2026-01-01", "pay", 5349850), row("b", "2026-01-31", "pay", 6445710)];
  expect(fitLabels(learnedLabels(rows), 7000000)).toEqual([]);
  const result = score(rows, 7000000);
  expect(result.reason).toBe("learned_payee");
  expect(result.confidence).toBeCloseTo(0.91 * 0.95, 10);
  expect(result.level).toBe("automatic");
});

test("one category with older lower pay: the older amount is outside the band and automatic", () => {
  const pay = monthly("p", 1, "pay", [4750910, 5069080, 5121510, 5600000, 5900000, 6100000, 6300000, 6510170]);
  const [label] = learnedLabels(pay);
  expect(label?.low).toBe(5121510);
  expect(fitLabels(learnedLabels(pay), 5069080)).toEqual([]);
  const result = score(pay, 5069080);
  expect(result.categoryId).toBe("pay");
  expect(result.reason).toBe("learned_payee");
  expect(result.confidenceMilli).toBeGreaterThanOrEqual(850);
  expect(result.level).toBe("automatic");
});

test("two categories and an amount outside all bands is not automatic (decisions 0043, 0044)", () => {
  const rows = [...monthly("m", 1, "misc", [-40000, -80000]), ...monthly("r", 3, "rent", Array<number>(7).fill(-2550000))];
  expect(signals(rows, -1500000).amountGuard).toBe(true);
  for (const amount of [-15000, -1500000, -2000000]) {
    const result = score(rows, amount);
    expect(result.categoryId).toBe("rent");
    expect(result.confidenceMilli).toBeGreaterThanOrEqual(850);
    expect(result.level).toBe("suggestion");
  }
  expect(score(rows, -2550000).level).toBe("automatic");
});

test("money out: Miscellaneous 40–80 and Rent 2,550 ×7 make 80 automatic Miscellaneous", () => {
  const rows = [...monthly("m", 1, "misc", [-40000, -80000]), ...monthly("r", 3, "rent", Array<number>(7).fill(-2550000))];
  const result = score(rows, -80000);
  expect(result.categoryId).toBe("misc");
  expect(result.reason).toBe("learned_amount");
  expect(result.confidenceMilli).toBe(864);
  expect(result.level).toBe("automatic");
});

test("money in: 40 is in the Other income band only, so Rental Income gets no payee signal and 40 is automatic", () => {
  const rows = [...monthly("o", 1, "other", [18720, 500000, 40000]), ...monthly("r", 4, "rental", Array<number>(8).fill(2000000))];
  const learned = signals(rows, 40000);
  expect(learned.payeeScores.map((score) => score.categoryId)).toEqual(["other"]);
  expect(learned.amountGuard).toBe(false);
  const result = score(rows, 40000);
  expect(result.categoryId).toBe("other");
  expect(result.signals.every((signal) => signal.categoryId === "other")).toBe(true);
  expect(result.confidenceMilli).toBe(899);
  expect(result.leadMilli).toBe(1000);
  expect(result.level).toBe("automatic");
  expect(score(rows, 2000000).categoryId).toBe("rental");
});

test("a band keeps the learned formula value of its label from all rows of the key", () => {
  const rows = [...monthly("o", 1, "other", [18720, 500000, 40000]), ...monthly("r", 4, "rental", Array<number>(8).fill(2000000))];
  const other = learnedConfidence(rows).find((score) => score.categoryId === "other");
  expect(signals(rows, 40000).payeeScores).toEqual(other ? [other] : []);
});

test("two merchants of one category count as one category for the guard", () => {
  const rows = [...monthly("b", 1, "rent", [-2000000], "b"), ...monthly("a", 2, "rent", Array<number>(4).fill(-2550000), "a")];
  expect(signals(rows, -1500000).amountGuard).toBe(false);
  const result = score(rows, -1500000);
  expect(result.merchantId).toBe("a");
  expect(result.level).toBe("automatic");
  const mixed = [...monthly("b", 1, "misc", [-2000000], "b"), ...monthly("a", 2, "rent", Array<number>(4).fill(-2550000), "a")];
  expect(signals(mixed, -1500000).amountGuard).toBe(true);
  expect(score(mixed, -1500000).level).toBe("suggestion");
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
    amountGuard: false,
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
