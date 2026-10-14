import { candidateKey, learnedConfidence, newestFirst, type LearnedRow, type LearnedScore } from "./matching";

/** Decision 0036: the newest confirmed amounts of a learned label make its band. */
export const bandSize = 6;

export type BandRow = LearnedRow & { amount: number };

/** One learned label (category + merchant) of one key, with the band of its amounts in absolute milliunits. */
export type LearnedLabel = { key: string; categoryId: string; rows: BandRow[]; low: number; high: number; factor: number };

/** width = (high − low) / high. factor = 1 − 0.05 × min(1, width / 0.5). */
export function widthFactor(low: number, high: number): number {
  return high === 0 ? 1 : 1 - 0.05 * Math.min(1, (2 * (high - low)) / high);
}

/** The amount is from the lowest − 1% to the highest + 1%. Integer milliunits only. */
export function bandContains(band: Pick<LearnedLabel, "low" | "high">, amount: number): boolean {
  const size = Math.abs(amount) * 100;
  return size >= band.low * 99 && size <= band.high * 101;
}

/** The labels of the confirmed rows of one key. Make them once when the match data loads. */
export function learnedLabels(rows: readonly BandRow[]): LearnedLabel[] {
  const groups = new Map<string, { categoryId: string; rows: BandRow[] }>();
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
function labelScores(fit: readonly LearnedLabel[]): LearnedScore[] {
  const factors = new Map(fit.map((label) => [label.key, label.factor]));
  return learnedConfidence(fit.flatMap((label) => label.rows)).map((score) => ({
    ...score,
    confidence: score.confidence * (factors.get(candidateKey(score.categoryId, score.merchantId)) ?? 1),
  }));
}

/**
 * The learned signals of one amount. When a band contains the amount, the payee signal is only for the labels of the
 * bands that contain it (decision 0044). When no band contains it and the labels have two or more categories, the
 * result is not automatic (decisions 0043, 0044).
 */
export function bandSignals(labels: readonly LearnedLabel[], fit: readonly LearnedLabel[], payeeScores: readonly LearnedScore[]) {
  if (fit.length === 0) {
    const categories = new Set(labels.map((label) => label.categoryId));
    return { amountScores: [], payeeScores, amountGuard: categories.size > 1 };
  }
  const keys = new Set(fit.map((label) => label.key));
  return {
    amountScores: labelScores(fit),
    payeeScores: payeeScores.filter((score) => keys.has(candidateKey(score.categoryId, score.merchantId))),
    amountGuard: false,
  };
}
