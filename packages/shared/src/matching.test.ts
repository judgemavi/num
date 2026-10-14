import { expect, test } from "bun:test";
import { reviewLevel } from "./review-level";
import {
  combineConfidence,
  confidenceMilli,
  learnedConfidence,
  matchLevel,
  scoreMatch,
  type LearnedRow,
  type ScoreInput,
} from "./matching";

function row(id: string, date: string, categoryId: string, merchantId: string | null = null): LearnedRow {
  return { id, date, categoryId, merchantId };
}

function score(patch: Partial<ScoreInput>) {
  return scoreMatch({
    mode: "balanced",
    recurring: null,
    amountScores: [],
    payeeScores: [],
    similar: null,
    transferRows: [],
    ...patch,
  });
}

test("Sure is an automatic label and a suggestion is Likely or Maybe", () => {
  expect(reviewLevel(true, 500)).toBe("sure");
  expect(reviewLevel(false, 800)).toBe("likely");
  expect(reviewLevel(false, 750)).toBe("likely");
  expect(reviewLevel(false, 749)).toBe("maybe");
  expect(reviewLevel(false, 599)).toBe("none");
  expect(reviewLevel(false, null)).toBe("none");
});

test("one confirmation and three that agree follow the learned formula", () => {
  const one = learnedConfidence([row("a", "2026-01-01", "rent")]);
  const three = learnedConfidence([
    row("c", "2026-03-01", "rent"),
    row("b", "2026-02-01", "rent"),
    row("a", "2026-01-01", "rent"),
  ]);
  expect(one[0]?.confidence).toBeCloseTo(0.85, 10);
  expect(three[0]?.confidence).toBeCloseTo(1 - 0.15 * 0.6 ** 2, 10);
  expect(one[0]?.count).toBe(1);
  expect(three[0]?.count).toBe(3);
});

test("a conflict splits the weight and does not make an automatic label", () => {
  const rows = [row("new", "2026-02-01", "gifts"), row("old", "2026-01-01", "rent")];
  const scores = learnedConfidence(rows);
  expect(scores).toHaveLength(2);
  expect(scores[0]?.categoryId).toBe("gifts");
  expect(scores[0]?.confidence).toBeCloseTo((1 / 1.5) * (1 - 0.15 * 0.6), 10);
  const result = score({ amountScores: scores, payeeScores: scores, mode: "balanced" });
  expect(result.level).not.toBe("automatic");
});

test("signals for one candidate combine and a small lead stays a suggestion", () => {
  expect(combineConfidence([0.5, 0.5])).toBeCloseTo(1 - 0.5 * 0.5, 10);
  expect(matchLevel(950, 200, "careful", false)).toBe("automatic");
  expect(matchLevel(949, 200, "careful", false)).toBe("suggestion");
  expect(matchLevel(850, 200, "balanced", false)).toBe("automatic");
  expect(matchLevel(849, 200, "balanced", false)).toBe("suggestion");
  expect(matchLevel(750, 200, "eager", false)).toBe("automatic");
  expect(matchLevel(749, 200, "eager", false)).toBe("suggestion");
  expect(matchLevel(599, 1000, "eager", false)).toBe("none");
  expect(matchLevel(990, 199, "eager", false)).toBe("suggestion");
  expect(matchLevel(990, 1000, "careful", true)).toBe("suggestion");
});

test("a recurring category label is automatic and a transfer is not", () => {
  const labeled = score({
    mode: "careful",
    recurring: {
      planId: "plan",
      planName: "Rent",
      categoryId: "rent",
      merchantId: "landlord",
      transferAccountId: null,
      mortgage: false,
    },
  });
  expect(labeled.level).toBe("automatic");
  expect(labeled.reason).toBe("recurring");
  expect(labeled.confidence).toBe(0.99);
  expect(labeled.confidenceMilli).toBe(990);
  expect(labeled.categoryId).toBe("rent");
  expect(labeled.merchantId).toBe("landlord");
  expect(labeled.sourceName).toBe("Rent");

  const transfer = score({
    recurring: {
      planId: "plan",
      planName: "Savings",
      categoryId: null,
      merchantId: null,
      transferAccountId: "savings",
      mortgage: false,
    },
  });
  expect(transfer.level).toBe("suggestion");
  expect(transfer.transferAccountId).toBe("savings");
  expect(transfer.categoryId).toBeNull();
});

test("a recurring mortgage item is an automatic split", () => {
  const result = score({
    mode: "careful",
    recurring: {
      planId: "plan",
      planName: "Mortgage",
      categoryId: null,
      merchantId: null,
      transferAccountId: "mortgage",
      mortgage: true,
    },
  });
  expect(result.level).toBe("automatic");
  expect(result.mortgage).toBe(true);
  expect(result.reason).toBe("recurring");
  expect(result.confidenceMilli).toBe(990);
});

test("the same e-transfer payee follows the amount, not the other amounts", () => {
  const rent = [
    row("r1", "2026-03-01", "rent"),
    row("r2", "2026-02-01", "rent"),
    row("r3", "2026-01-01", "rent"),
  ];
  const other = [row("g1", "2026-03-15", "gifts"), row("g2", "2026-02-15", "gifts"), row("g3", "2026-01-15", "gifts")];
  const payeeScores = learnedConfidence([...rent, ...other]);
  const rentPayment = score({ amountScores: learnedConfidence(rent), payeeScores, mode: "balanced" });
  const otherPayment = score({ amountScores: learnedConfidence(other), payeeScores, mode: "balanced" });
  expect(rentPayment.categoryId).toBe("rent");
  expect(rentPayment.level).toBe("automatic");
  expect(otherPayment.categoryId).toBe("gifts");
});

test("confidence millis stay inside 0 to 1000", () => {
  expect(confidenceMilli(0.994)).toBe(994);
  expect(confidenceMilli(1.2)).toBe(1000);
  expect(confidenceMilli(-1)).toBe(0);
});

test("a similar payee is never automatic, even when eager and combined with a merchant default", () => {
  const scores = learnedConfidence([row("a", "2026-01-01", "fares"), row("b", "2026-01-02", "fares"), row("c", "2026-01-03", "fares")]);
  const similar = { payee: "PRESTO", scores, transferRows: [] };
  const alone = score({ similar, mode: "eager" });
  expect(alone.reason).toBe("similar");
  expect(alone.sourceName).toBe("PRESTO");
  expect(alone.confidence).toBeCloseTo((scores[0]?.confidence ?? 0) * 0.9, 10);
  expect(alone.level).toBe("suggestion");
  const merchant = { id: "m", name: "Presto", categoryId: "fares" };
  const combined = score({ similar, merchant, mode: "eager" });
  expect(combined.confidence).toBeGreaterThan(0.75);
  expect(combined.level).toBe("suggestion");
});

test("a brand family suggestion uses the lowest confidence times 0.85 and is never automatic", () => {
  const family = { word: "PRESTO", categoryId: "transit", merchantId: null, transferAccountId: null, confidence: 0.91, sourceId: "a", count: 2 };
  const alone = score({ family, mode: "eager" });
  expect(alone.reason).toBe("family");
  expect(alone.sourceName).toBe("PRESTO");
  expect(alone.confidence).toBeCloseTo(0.91 * 0.85, 10);
  expect(alone.level).toBe("suggestion");
  const merchant = { id: "m", name: "Presto", categoryId: "transit" };
  const combined = score({ family, merchant, mode: "eager" });
  expect(combined.confidence).toBeGreaterThan(0.75);
  expect(combined.level).toBe("suggestion");
});

test("a learned transfer payee gives a transfer suggestion that is never automatic", () => {
  const transferRows = [
    { id: "a", date: "2026-01-01", transferAccountId: "visa" },
    { id: "b", date: "2026-01-02", transferAccountId: "visa" },
    { id: "c", date: "2026-01-03", transferAccountId: "visa" },
  ];
  const result = score({ similar: { payee: "VISA PAYMENT", scores: [], transferRows }, mode: "eager" });
  expect(result.transferAccountId).toBe("visa");
  expect(result.reason).toBe("similar");
  expect(result.level).toBe("suggestion");
});
