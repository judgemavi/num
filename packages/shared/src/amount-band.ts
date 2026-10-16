import { candidateKey, learnedConfidence, newestFirst, type LearnedRow, type LearnedScore } from "./matching";

/** The newest confirmed amounts of a learned label make its band. */
const bandSize = 6;

/** A null category is the label "no category". */
export type BandRow = LearnedRow<string | null> & { amount: number };

/** One learned label (category + merchant) of one key, with the band of its amounts in absolute milliunits. */
export type LearnedLabel = { key: string; categoryId: string | null; rows: BandRow[]; low: number; high: number; factor: number };

/** width = (high − low) / high. factor = 1 − 0.05 × min(1, width / 0.5). */
export function widthFactor(low: number, high: number): number {
  return high === 0 ? 1 : 1 - 0.05 * Math.min(1, (2 * (high - low)) / high);
}

/** The amount is from the lowest − 1% to the highest + 1%. Integer milliunits only. */
export function bandContains(band: Pick<LearnedLabel, "low" | "high">, amount: number): boolean {
  const size = Math.abs(amount) * 100;
  return size >= band.low * 99 && size <= band.high * 101;
}

/** The amount is from 75% of the lowest to 125% of the highest. Integer milliunits only. */
export function bandNear(band: Pick<LearnedLabel, "low" | "high">, amount: number): boolean {
  const size = Math.abs(amount) * 100;
  return size >= band.low * 75 && size <= band.high * 125;
}

/** The labels of the confirmed rows of one key. Make them once when the match data loads. */
export function learnedLabels(rows: readonly BandRow[]): LearnedLabel[] {
  const groups = new Map<string, { categoryId: string | null; rows: BandRow[] }>();
  for (const row of rows) {
    const key = candidateKey(row.categoryId, row.merchantId);
    const group = groups.get(key);
    if (group) {
      group.rows.push(row);
    } else {
      groups.set(key, { categoryId: row.categoryId, rows: [row] });
    }
  }
  return [...groups].map(([key, { categoryId, rows: list }]) => {
    const amounts = [...list].sort(newestFirst).slice(0, bandSize).map((row) => Math.abs(row.amount));
    const low = Math.min(...amounts);
    const high = Math.max(...amounts);
    return { key, categoryId, rows: list, low, high, factor: widthFactor(low, high) };
  });
}

/** The labels whose band contains the amount. */
export function fitLabels(labels: readonly LearnedLabel[], amount: number): LearnedLabel[] {
  return labels.filter((label) => bandContains(label, amount));
}

/** The payee + amount scores: the rows of the labels that fit, each score × the width factor of its label. */
function labelScores(fit: readonly LearnedLabel[]) {
  const factors = new Map(fit.map((label) => [label.key, label.factor]));
  return learnedConfidence(fit.flatMap((label) => label.rows)).map((score) => ({
    ...score,
    confidence: score.confidence * (factors.get(candidateKey(score.categoryId, score.merchantId)) ?? 1),
  }));
}

/**
 * True when no band contains the amount and the result must not be automatic: the labels have two or more categories
 *, or one category and no band is near the amount. "No category" counts as a
 * category.
 */
export function amountGuardFor(labels: readonly LearnedLabel[], fit: readonly LearnedLabel[], amount: number): boolean {
  if (fit.length > 0 || labels.length === 0) {
    return false;
  }
  const categories = new Set(labels.map((label) => label.categoryId));
  return categories.size > 1 || !labels.some((label) => bandNear(label, amount));
}

/**
 * The learned signals of one amount. When a band contains the amount, the payee signal is only for the labels of the
 * bands that contain it. The signals depend only on the payee and the fit labels.
 */
export function bandSignals(fit: readonly LearnedLabel[], payeeScores: readonly LearnedScore<string | null>[]) {
  if (fit.length === 0) {
    return { amountScores: [], payeeScores };
  }
  const keys = new Set(fit.map((label) => label.key));
  return {
    amountScores: labelScores(fit),
    payeeScores: payeeScores.filter((score) => keys.has(candidateKey(score.categoryId, score.merchantId))),
  };
}
