import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { autoReasons, type AutoReason, type MatchResult } from "./matching";
import { queryNumber } from "./list";
import { dayDistance } from "./recurring-calc";
import { reviewLevel, reviewLevels } from "./review-level";

export const suggestionReasons = [...autoReasons, "none"] as const;

export type SuggestionReason = (typeof suggestionReasons)[number];

export const suggestionSchema = z.object({
  merchantId: z.uuid().nullable(),
  categoryId: z.uuid().nullable(),
  transferAccountId: z.uuid().nullable(),
  reason: z.enum(suggestionReasons),
  level: z.enum(reviewLevels),
  sourceId: z.uuid().nullable(),
  confidence: z.number().int().min(0).max(1000),
  mortgage: z.boolean(),
  /** The answer is "no category": keep the row uncategorized (decision 0046). */
  keep: z.boolean(),
});

export const suggestionQuerySchema = z.object({
  accountId: z.uuid(),
  payee: z.string().trim().min(1),
  amount: queryNumber(),
  date: z.iso.date().optional(),
});

export const transferPairSchema = z.object({
  leftId: z.uuid(),
  rightId: z.uuid(),
});

export type Suggestion = z.infer<typeof suggestionSchema>;
export type TransferPair = z.infer<typeof transferPairSchema>;

const none: Suggestion = {
  merchantId: null,
  categoryId: null,
  transferAccountId: null,
  reason: "none",
  level: "none",
  sourceId: null,
  confidence: 0,
  mortgage: false,
  keep: false,
};

export function suggestionFromMatch(result: MatchResult): Suggestion {
  if (result.level === "none" || result.mortgage || (result.categoryId === null && result.transferAccountId === null && !result.keep)) {
    return none;
  }
  const reason: AutoReason | "none" = result.reason ?? "none";
  return {
    merchantId: result.transferAccountId ? null : result.merchantId,
    categoryId: result.categoryId,
    transferAccountId: result.transferAccountId,
    reason,
    level: reviewLevel(false, result.confidenceMilli),
    sourceId: result.sourceId,
    confidence: result.confidenceMilli,
    mortgage: false,
    keep: result.keep,
  };
}

export type TransferCandidate = {
  id: string;
  accountId: string;
  onBudget: boolean;
  date: string;
  amount: number;
  linked: boolean;
  imported: boolean;
};

function pairAmount(group: TransferCandidate[]) {
  const outgoing = group.filter((row) => row.amount < 0);
  const incoming = group.filter((row) => row.amount > 0);
  const used = new Set<string>();
  const pairs: TransferPair[] = [];
  let incomingIndex = 0;
  for (const row of outgoing) {
    while (
      incomingIndex < incoming.length &&
      incoming[incomingIndex] !== undefined &&
      incoming[incomingIndex]!.date < row.date &&
      dayDistance(row.date, incoming[incomingIndex]!.date) > 3
    ) {
      incomingIndex += 1;
    }
    for (let cursor = incomingIndex; cursor < incoming.length; cursor += 1) {
      const other = incoming[cursor];
      if (!other) {
        break;
      }
      if (other.date > row.date && dayDistance(row.date, other.date) > 3) {
        break;
      }
      if (used.has(other.id) || other.accountId === row.accountId || other.amount !== -row.amount) {
        continue;
      }
      if (!row.imported && !other.imported) {
        continue;
      }
      used.add(other.id);
      const [leftId, rightId] = row.id < other.id ? [row.id, other.id] : [other.id, row.id];
      pairs.push({ leftId, rightId });
      break;
    }
  }
  return pairs;
}

export type TransferMatchRow = {
  id: string;
  date: string;
  amount: number;
  lineCount: number;
  reconciled: boolean;
};

/** One unlinked opposite transaction within ±3 days. The closest date wins. */
export function chooseTransferMatch(
  rows: TransferMatchRow[],
  input: { date: string; lineAmount: number },
): string | null {
  const wanted = -input.lineAmount;
  const open = rows.filter(
    (row) =>
      row.amount === wanted &&
      row.lineCount === 1 &&
      !row.reconciled &&
      dayDistance(row.date, input.date) <= 3,
  );
  open.sort((left, right) => {
    const distance = dayDistance(left.date, input.date) - dayDistance(right.date, input.date);
    if (distance !== 0) {
      return distance;
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
  return open[0]?.id ?? null;
}

export function transferPairs(rows: TransferCandidate[], asOf: string): TransferPair[] {
  const start = Temporal.PlainDate.from(asOf).subtract({ days: 90 }).toString();
  const open = rows
    .filter((row) => row.onBudget && !row.linked && row.amount !== 0 && row.date >= start && row.date <= asOf)
    .sort((left, right) => {
      const amount = Math.abs(left.amount) - Math.abs(right.amount);
      if (amount !== 0) {
        return amount;
      }
      if (left.date !== right.date) {
        return left.date < right.date ? -1 : 1;
      }
      return left.id < right.id ? -1 : 1;
    });
  const groups: TransferCandidate[][] = [];
  for (const row of open) {
    const last = groups.at(-1);
    if (!last || Math.abs(last[0]?.amount ?? 0) !== Math.abs(row.amount)) {
      groups.push([row]);
    } else {
      last.push(row);
    }
  }
  return groups.flatMap(pairAmount);
}
