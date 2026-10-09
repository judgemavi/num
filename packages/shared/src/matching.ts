import { similarPayees as rankSimilar, type TrigramIndex } from "./trigram";

export { buildTrigramIndex, characterTrigrams, trigramCosine, type TrigramIndex } from "./trigram";

export const autoReasons = ["recurring", "learned_amount", "learned_payee", "similar", "merchant_default"] as const;

export type AutoReason = (typeof autoReasons)[number];

export const confidenceModes = ["careful", "balanced", "eager"] as const;

export type ConfidenceMode = (typeof confidenceModes)[number];

export const confidenceThresholds: Record<ConfidenceMode, number> = {
  careful: 0.95,
  balanced: 0.85,
  eager: 0.75,
};

export const suggestionFloor = 0.6;
export const likelyMinimum = 0.75;
export const leadMinimum = 0.2;
export const similarMinimum = 0.8;
export const recurringConfidence = 0.99;
export const merchantDefaultConfidence = 0.6;

export type LearnedRow = {
  id: string;
  date: string;
  categoryId: string;
  merchantId: string | null;
};

export type LearnedScore = {
  categoryId: string;
  merchantId: string | null;
  confidence: number;
  count: number;
  sourceId: string;
};

export type MatchLevel = "automatic" | "suggestion" | "none";

export type RecurringSignal = {
  planId: string;
  planName: string;
  categoryId: string | null;
  merchantId: string | null;
  transferAccountId: string | null;
  mortgage: boolean;
};

export type SimilarPayee = {
  payee: string;
  similarity: number;
  rows: readonly LearnedRow[];
  scores?: readonly LearnedScore[];
};

export type ScoreInput = {
  mode: ConfidenceMode;
  recurring: RecurringSignal | null;
  amountRows: readonly LearnedRow[];
  payeeRows: readonly LearnedRow[];
  amountScores?: readonly LearnedScore[];
  payeeScores?: readonly LearnedScore[];
  similar: readonly SimilarPayee[];
  merchant: { id: string; name: string; categoryId: string } | null;
  transferRows: readonly { id: string; date: string; transferAccountId: string }[];
};

export type MatchSignal = {
  reason: AutoReason;
  confidence: number;
  categoryId: string | null;
  merchantId: string | null;
  transferAccountId: string | null;
  sourceId: string | null;
  sourceName: string | null;
  count: number;
};

export type MatchResult = {
  level: MatchLevel;
  confidence: number;
  confidenceMilli: number;
  lead: number;
  reason: AutoReason | null;
  sourceId: string | null;
  sourceName: string | null;
  categoryId: string | null;
  merchantId: string | null;
  transferAccountId: string | null;
  learnedCount: number | null;
  mortgage: boolean;
  signals: MatchSignal[];
};

type Candidate = {
  categoryId: string | null;
  merchantId: string | null;
  transferAccountId: string | null;
  confidence: number;
  reason: AutoReason;
  sourceId: string | null;
  sourceName: string | null;
  count: number;
  signals: MatchSignal[];
};

const emptyMatch: MatchResult = {
  level: "none",
  confidence: 0,
  confidenceMilli: 0,
  lead: 0,
  reason: null,
  sourceId: null,
  sourceName: null,
  categoryId: null,
  merchantId: null,
  transferAccountId: null,
  learnedCount: null,
  mortgage: false,
  signals: [],
};

function newestFirst(left: { date: string; id: string }, right: { date: string; id: string }): number {
  if (left.date !== right.date) {
    return left.date < right.date ? 1 : -1;
  }
  return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
}

function candidateKey(categoryId: string, merchantId: string | null): string {
  return `${categoryId}\0${merchantId ?? ""}`;
}

export function learnedConfidence(rows: readonly LearnedRow[]): LearnedScore[] {
  const ordered = [...rows].sort(newestFirst);
  const count = ordered.length;
  if (count === 0) {
    return [];
  }
  let total = 0;
  const weights: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const weight = 0.5 ** index;
    weights.push(weight);
    total += weight;
  }
  const certainty = 1 - 0.15 * 0.6 ** (count - 1);
  const groups = new Map<string, { row: LearnedRow; weight: number }>();
  ordered.forEach((row, index) => {
    const key = candidateKey(row.categoryId, row.merchantId);
    const weight = weights[index] ?? 0;
    const current = groups.get(key);
    if (current) {
      current.weight += weight;
    } else {
      groups.set(key, { row, weight });
    }
  });
  const scores: LearnedScore[] = [];
  for (const group of groups.values()) {
    const confidence = total === 0 ? 0 : (group.weight / total) * certainty;
    scores.push({
      categoryId: group.row.categoryId,
      merchantId: group.row.merchantId,
      confidence,
      count,
      sourceId: group.row.id,
    });
  }
  scores.sort((left, right) => right.confidence - left.confidence || (left.categoryId < right.categoryId ? -1 : 1));
  return scores;
}

export function combineConfidence(values: readonly number[]): number {
  return 1 - values.reduce((product, value) => product * (1 - value), 1);
}

export function confidenceMilli(confidence: number): number {
  return Math.min(1000, Math.max(0, Math.round(confidence * 1000)));
}

export function matchLevel(confidence: number, lead: number, mode: ConfidenceMode, transfer: boolean): MatchLevel {
  if (confidence < suggestionFloor) {
    return "none";
  }
  if (transfer || lead < leadMinimum) {
    return "suggestion";
  }
  return confidence >= confidenceThresholds[mode] ? "automatic" : "suggestion";
}

export function amountsWithinOnePercent(left: number, right: number): boolean {
  const delta = Math.abs(left - right);
  const scale = Math.max(Math.abs(left), Math.abs(right));
  return delta * 100 <= scale;
}

export function similarPayees(index: TrigramIndex, payee: string, minimum = similarMinimum) {
  return rankSimilar(index, payee, minimum);
}

function pushLearned(
  signals: MatchSignal[],
  scores: readonly LearnedScore[],
  reason: AutoReason,
  factor: number,
  sourceName: string | null,
): void {
  for (const score of scores) {
    const confidence = score.confidence * factor;
    if (confidence <= 0) {
      continue;
    }
    signals.push({
      reason,
      confidence,
      categoryId: score.categoryId,
      merchantId: score.merchantId,
      transferAccountId: null,
      sourceId: score.sourceId,
      sourceName,
      count: score.count,
    });
  }
}

function collectSignals(input: ScoreInput): MatchSignal[] {
  const signals: MatchSignal[] = [];
  if (input.recurring?.mortgage) {
    signals.push({
      reason: "recurring",
      confidence: recurringConfidence,
      categoryId: null,
      merchantId: input.recurring.merchantId,
      transferAccountId: input.recurring.transferAccountId,
      sourceId: input.recurring.planId,
      sourceName: input.recurring.planName,
      count: 0,
    });
    return signals;
  }
  if (input.recurring?.categoryId) {
    signals.push({
      reason: "recurring",
      confidence: recurringConfidence,
      categoryId: input.recurring.categoryId,
      merchantId: input.recurring.merchantId,
      transferAccountId: null,
      sourceId: input.recurring.planId,
      sourceName: input.recurring.planName,
      count: 0,
    });
    return signals;
  }
  if (input.recurring?.transferAccountId) {
    signals.push({
      reason: "recurring",
      confidence: recurringConfidence,
      categoryId: null,
      merchantId: null,
      transferAccountId: input.recurring.transferAccountId,
      sourceId: input.recurring.planId,
      sourceName: input.recurring.planName,
      count: 0,
    });
  }
  pushLearned(signals, input.amountScores ?? learnedConfidence(input.amountRows), "learned_amount", 1, null);
  pushLearned(signals, input.payeeScores ?? learnedConfidence(input.payeeRows), "learned_payee", 0.95, null);
  for (const similar of input.similar) {
    if (similar.similarity < similarMinimum) {
      continue;
    }
    pushLearned(signals, similar.scores ?? learnedConfidence(similar.rows), "similar", similar.similarity, similar.payee);
  }
  const transferLearned = learnedConfidence(
    input.transferRows.map((row) => ({ id: row.id, date: row.date, categoryId: row.transferAccountId, merchantId: null })),
  );
  for (const score of transferLearned) {
    signals.push({
      reason: "learned_payee",
      confidence: score.confidence,
      categoryId: null,
      merchantId: null,
      transferAccountId: score.categoryId,
      sourceId: score.sourceId,
      sourceName: null,
      count: score.count,
    });
  }
  if (input.merchant) {
    signals.push({
      reason: "merchant_default",
      confidence: merchantDefaultConfidence,
      categoryId: input.merchant.categoryId,
      merchantId: input.merchant.id,
      transferAccountId: null,
      sourceId: input.merchant.id,
      sourceName: input.merchant.name,
      count: 0,
    });
  }
  return signals;
}

function groupCandidates(signals: readonly MatchSignal[]): Candidate[] {
  const groups = new Map<string, Candidate>();
  for (const signal of signals) {
    const key = signal.transferAccountId
      ? `transfer\0${signal.transferAccountId}`
      : signal.categoryId
        ? candidateKey(signal.categoryId, signal.merchantId)
        : "";
    if (key.length === 0) {
      continue;
    }
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
        categoryId: signal.categoryId,
        merchantId: signal.merchantId,
        transferAccountId: signal.transferAccountId,
        confidence: signal.confidence,
        reason: signal.reason,
        sourceId: signal.sourceId,
        sourceName: signal.sourceName,
        count: signal.count,
        signals: [signal],
      });
      continue;
    }
    current.signals.push(signal);
    current.confidence = combineConfidence(current.signals.map((item) => item.confidence));
    const strongest = [...current.signals].sort((left, right) => right.confidence - left.confidence)[0];
    if (strongest) {
      current.reason = strongest.reason;
      current.sourceId = strongest.sourceId;
      current.sourceName = strongest.sourceName ?? current.sourceName;
      current.count = Math.max(current.count, strongest.count);
    }
  }
  return [...groups.values()].sort((left, right) => right.confidence - left.confidence);
}

function resultFrom(candidate: Candidate, second: number | null, mode: ConfidenceMode, mortgage: boolean): MatchResult {
  const lead = second === null ? 1 : candidate.confidence - second;
  const transfer = candidate.transferAccountId !== null && candidate.categoryId === null;
  const learned = candidate.signals.find((signal) => signal.reason === "learned_amount" || signal.reason === "learned_payee" || signal.reason === "similar");
  return {
    level: mortgage ? "automatic" : matchLevel(candidate.confidence, lead, mode, transfer),
    confidence: candidate.confidence,
    confidenceMilli: confidenceMilli(candidate.confidence),
    lead,
    reason: candidate.reason,
    sourceId: candidate.sourceId,
    sourceName: candidate.sourceName,
    categoryId: candidate.categoryId,
    merchantId: candidate.merchantId,
    transferAccountId: candidate.transferAccountId,
    learnedCount: learned && learned.count > 0 ? learned.count : null,
    mortgage,
    signals: candidate.signals,
    };
}

export function scoreMatch(input: ScoreInput): MatchResult {
  const signals = collectSignals(input);
  const candidates = groupCandidates(signals);
  const best = candidates[0];
  if (!best) {
    return emptyMatch;
  }
  const mortgage = input.recurring?.mortgage === true;
  return resultFrom(best, candidates[1]?.confidence ?? null, input.mode, mortgage);
}
