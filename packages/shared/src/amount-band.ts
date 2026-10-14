import { candidateKey, learnedConfidence, newestFirst, type LearnedRow, type LearnedScore } from "./matching";

/** Decision 0036: the newest confirmed amounts of a learned label make its band. */
export const bandSize = 6;

export type BandRow = LearnedRow & { amount: number };

/** One learned label (category + merchant) of one key, with the band of its amounts in absolute cents. */
export type LearnedLabel = { key: string; rows: BandRow[]; low: number; high: number; factor: number };

/** width = (high − low) / high. factor = 1 − 0.05 × min(1, width / 0.5). */
export function widthFactor(low: number, high: number): number {
  return high === 0 ? 1 : 1 - 0.05 * Math.min(1, (2 * (high - low)) / high);
}

/** The amount is from the lowest − 1% to the highest + 1%. Integer cents only. */
export function bandContains(band: Pick<LearnedLabel, "low" | "high">, amount: number): boolean {
  const size = Math.abs(amount) * 100;
  return size >= band.low * 99 && size <= band.high * 101;
}

/** The labels of the confirmed rows of one key. Make them once when the match data loads. */
export function learnedLabels(rows: readonly BandRow[]): LearnedLabel[] {
  const groups = new Map<string, BandRow[]>();
  for (const row of rows) {
    const key = candidateKey(row.categoryId, row.merchantId);
    const list = groups.get(key);
    if (list) {
      list.push(row);
    } else {
      groups.set(key, [row]);
    }
  }
  return [...groups].map(([key, list]) => {
    const amounts = [...list].sort(newestFirst).slice(0, bandSize).map((row) => Math.abs(row.amount));
    const low = Math.min(...amounts);
    const high = Math.max(...amounts);
    return { key, rows: list, low, high, factor: widthFactor(low, high) };
  });
}

/** The labels whose band contains the amount. */
export function fitLabels(labels: readonly LearnedLabel[], amount: number): LearnedLabel[] {
  return labels.filter((label) => bandContains(label, amount));
}

/** The payee + amount scores: the rows of the labels that fit, each score × the width factor of its label. */
export function labelScores(fit: readonly LearnedLabel[]): LearnedScore[] {
  const factors = new Map(fit.map((label) => [label.key, label.factor]));
  return learnedConfidence(fit.flatMap((label) => label.rows)).map((score) => ({
    ...score,
    confidence: score.confidence * (factors.get(candidateKey(score.categoryId, score.merchantId)) ?? 1),
  }));
}
