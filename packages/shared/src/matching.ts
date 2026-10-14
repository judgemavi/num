export const autoReasons = ["recurring", "learned_amount", "learned_payee", "similar", "family", "refund_match", "refund_reversal", "transfer_match"] as const;

export type AutoReason = (typeof autoReasons)[number];

/**
 * A suggestion at or above this confidence, in thousandths, is an automatic label (decision 0039). The level compares
 * it with `confidenceMilli` (decision 0036).
 */
const automaticThreshold = 850;

export const suggestionFloor = 600;
export const likelyMinimum = 750;
export const leadMinimum = 200;
export const similarFactor = 0.9;
export const familyFactor = 0.85;
export const recurringConfidence = 0.99;

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
  sourceId: string;
};

export type MatchLevel = "automatic" | "suggestion" | "none";

export type RecurringSignal = {
  planId: string;
  categoryId: string | null;
  merchantId: string | null;
  transferAccountId: string | null;
  mortgage: boolean;
};

/** A learned payee that the new payee contains with other words left (decision 0026). */
export type SimilarPayee = {
  scores: readonly LearnedScore[];
  transferRows: readonly { id: string; date: string; transferAccountId: string }[];
};

/** Other learned payees with the same first word that all teach one answer (decision 0026, rule 7). */
export type FamilySignal = {
  categoryId: string | null;
  merchantId: string | null;
  transferAccountId: string | null;
  /** The lowest learned confidence of the payees in the family. */
  confidence: number;
  sourceId: string;
};

export type ScoreInput = {
  recurring: RecurringSignal | null;
  amountScores: readonly LearnedScore[];
  payeeScores: readonly LearnedScore[];
  similar: SimilarPayee | null;
  family?: FamilySignal | null;
  transferRows: readonly { id: string; date: string; transferAccountId: string }[];
  /** The key has learned labels and no band contains the amount. The result is then not automatic (decision 0043). */
  outsideBands: boolean;
};

export type MatchSignal = {
  reason: AutoReason;
  confidence: number;
  categoryId: string | null;
  merchantId: string | null;
  transferAccountId: string | null;
  sourceId: string | null;
};

export type MatchResult = {
  level: MatchLevel;
  confidence: number;
  confidenceMilli: number;
  leadMilli: number;
  reason: AutoReason | null;
  sourceId: string | null;
  categoryId: string | null;
  merchantId: string | null;
  transferAccountId: string | null;
  mortgage: boolean;
  signals: MatchSignal[];
};

type Candidate = {
  confidence: number;
  /** The strongest signal. It gives the answer, the reason and the source. */
  top: MatchSignal;
  signals: MatchSignal[];
};

const emptyMatch: MatchResult = {
  level: "none",
  confidence: 0,
  confidenceMilli: 0,
  leadMilli: 0,
  reason: null,
  sourceId: null,
  categoryId: null,
  merchantId: null,
  transferAccountId: null,
  mortgage: false,
  signals: [],
};

export function newestFirst(left: { date: string; id: string }, right: { date: string; id: string }): number {
  if (left.date !== right.date) {
    return left.date < right.date ? 1 : -1;
  }
  return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
}

export function candidateKey(categoryId: string, merchantId: string | null) {
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

/** Confidence and lead are in thousandths. */
export function matchLevel(confidence: number, lead: number, suggestionOnly: boolean): MatchLevel {
  if (confidence < suggestionFloor) {
    return "none";
  }
  if (suggestionOnly || lead < leadMinimum) {
    return "suggestion";
  }
  return confidence >= automaticThreshold ? "automatic" : "suggestion";
}

function pushLearned(
  signals: MatchSignal[],
  scores: readonly LearnedScore[],
  reason: AutoReason,
  factor: number,
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
    });
  }
}

function pushTransfers(
  signals: MatchSignal[],
  rows: ScoreInput["transferRows"],
  reason: AutoReason,
  factor: number,
): void {
  const learned = learnedConfidence(
    rows.map((row) => ({ id: row.id, date: row.date, categoryId: row.transferAccountId, merchantId: null })),
  );
  for (const score of learned) {
    signals.push({
      reason,
      confidence: score.confidence * factor,
      categoryId: null,
      merchantId: null,
      transferAccountId: score.categoryId,
      sourceId: score.sourceId,
    });
  }
}

function collectSignals(input: ScoreInput) {
  const signals: MatchSignal[] = [];
  if (input.recurring?.mortgage) {
    signals.push({
      reason: "recurring",
      confidence: recurringConfidence,
      categoryId: null,
      merchantId: input.recurring.merchantId,
      transferAccountId: input.recurring.transferAccountId,
      sourceId: input.recurring.planId,
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
    });
  }
  pushLearned(signals, input.amountScores, "learned_amount", 1);
  pushLearned(signals, input.payeeScores, "learned_payee", 0.95);
  if (input.similar) {
    pushLearned(signals, input.similar.scores, "similar", similarFactor);
    pushTransfers(signals, input.similar.transferRows, "similar", similarFactor);
  }
  if (input.family) {
    signals.push({
      reason: "family",
      confidence: input.family.confidence * familyFactor,
      categoryId: input.family.categoryId,
      merchantId: input.family.merchantId,
      transferAccountId: input.family.transferAccountId,
      sourceId: input.family.sourceId,
    });
  }
  pushTransfers(signals, input.transferRows, "learned_payee", 1);
  return signals;
}

/** Decision 0036: payee + amount and payee learn from the same rows. The candidate takes the higher one of the two. */
function candidateConfidence(signals: readonly MatchSignal[]) {
  let learned = 0;
  const others: number[] = [];
  for (const signal of signals) {
    if (signal.reason === "learned_amount" || signal.reason === "learned_payee") {
      learned = Math.max(learned, signal.confidence);
    } else {
      others.push(signal.confidence);
    }
  }
  return combineConfidence([learned, ...others]);
}

function groupCandidates(signals: readonly MatchSignal[]): Candidate[] {
  const groups = new Map<string, MatchSignal[]>();
  for (const signal of signals) {
    const key = signal.transferAccountId
      ? `transfer\0${signal.transferAccountId}`
      : signal.categoryId
        ? candidateKey(signal.categoryId, signal.merchantId)
        : "";
    if (key.length === 0) {
      continue;
    }
    const list = groups.get(key);
    if (list) {
      list.push(signal);
    } else {
      groups.set(key, [signal]);
    }
  }
  return [...groups.values()]
    .map((list) => ({
      confidence: candidateConfidence(list),
      top: list.reduce((best, signal) => (signal.confidence > best.confidence ? signal : best)),
      signals: list,
    }))
    .sort((left, right) => right.confidence - left.confidence);
}

function resultFrom(candidate: Candidate, second: number | null, mortgage: boolean, outsideBands: boolean): MatchResult {
  const { top } = candidate;
  const milli = confidenceMilli(candidate.confidence);
  const leadMilli = second === null ? 1000 : milli - confidenceMilli(second);
  const transfer = top.transferAccountId !== null && top.categoryId === null;
  const similar = candidate.signals.some((signal) => signal.reason === "similar" || signal.reason === "family");
  const guarded = outsideBands && candidate.signals.every((signal) => signal.reason !== "recurring");
  return {
    level: mortgage ? "automatic" : matchLevel(milli, leadMilli, transfer || similar || guarded),
    confidence: candidate.confidence,
    confidenceMilli: milli,
    leadMilli,
    reason: top.reason,
    sourceId: top.sourceId,
    categoryId: top.categoryId,
    merchantId: top.merchantId,
    transferAccountId: top.transferAccountId,
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
  return resultFrom(best, candidates[1]?.confidence ?? null, mortgage, input.outsideBands);
}
