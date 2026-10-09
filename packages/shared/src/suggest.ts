import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { autoReasons, scoreMatch, type AutoReason, type LearnedRow, type MatchResult, type SimilarPayee } from "./matching";
import { normalizePayee } from "./payee";
import { dayDistance } from "./recurring-calc";

export const suggestionReasons = [...autoReasons, "none"] as const;

export type SuggestionReason = (typeof suggestionReasons)[number];

export const suggestionSchema = z.object({
  merchantId: z.uuid().nullable(),
  categoryId: z.uuid().nullable(),
  transferAccountId: z.uuid().nullable(),
  reason: z.enum(suggestionReasons),
  sure: z.boolean(),
  sourceId: z.uuid().nullable(),
  confidence: z.number().int().min(0).max(1000),
});

export const suggestionQuerySchema = z.object({
  accountId: z.uuid(),
  payee: z.string().trim().min(1),
  amount: z.coerce.number().int(),
});

export const transferPairSchema = z.object({
  leftId: z.uuid(),
  rightId: z.uuid(),
});

export const transferPairListSchema = z.object({
  items: z.array(transferPairSchema),
});

export type Suggestion = z.infer<typeof suggestionSchema>;
export type TransferPair = z.infer<typeof transferPairSchema>;

export type HistoryRow = {
  id: string;
  date: string;
  amount: number;
  payeeRaw: string;
  merchantId: string | null;
  categoryId: string | null;
  transferAccountId?: string | null;
};

export type MerchantChoice = {
  id: string;
  name: string;
  defaultCategoryId: string | null;
  archivedAt: string | null;
};

const none: Suggestion = {
  merchantId: null,
  categoryId: null,
  transferAccountId: null,
  reason: "none",
  sure: false,
  sourceId: null,
  confidence: 0,
};

function learnedRows(rows: readonly HistoryRow[]): LearnedRow[] {
  return rows.flatMap((row) =>
    row.categoryId && !row.transferAccountId
      ? [{ id: row.id, date: row.date, categoryId: row.categoryId, merchantId: row.merchantId }]
      : [],
  );
}

export function suggestionFromMatch(result: MatchResult): Suggestion {
  if (result.level === "none" || result.mortgage || (result.categoryId === null && result.transferAccountId === null)) {
    return none;
  }
  const reason: AutoReason | "none" = result.reason ?? "none";
  return {
    merchantId: result.transferAccountId ? null : result.merchantId,
    categoryId: result.categoryId,
    transferAccountId: result.transferAccountId,
    reason,
    sure: false,
    sourceId: result.sourceId,
    confidence: result.confidenceMilli,
  };
}

export function alternateFromMatch(result: MatchResult): Suggestion | null {
  const next = result.alternate;
  if (!next || (next.categoryId === null && next.transferAccountId === null)) {
    return null;
  }
  return {
    merchantId: next.transferAccountId ? null : next.merchantId,
    categoryId: next.categoryId,
    transferAccountId: next.transferAccountId,
    reason: next.reason,
    sure: false,
    sourceId: next.sourceId,
    confidence: next.confidenceMilli,
  };
}

export function suggestCategorization(input: {
  rawPayee: string;
  amount: number;
  mode: "careful" | "balanced" | "eager";
  history: HistoryRow[];
  similar: readonly SimilarPayee[];
  merchants: MerchantChoice[];
}): Suggestion {
  const payee = normalizePayee(input.rawPayee);
  if (payee.length === 0) {
    return none;
  }
  const same = input.history.filter((row) => normalizePayee(row.payeeRaw) === payee);
  const amountRows = learnedRows(same.filter((row) => Math.abs(row.amount - input.amount) * 100 <= Math.max(Math.abs(row.amount), Math.abs(input.amount))));
  const merchantMatches = input.merchants.filter(
    (merchant) => merchant.archivedAt === null && merchant.defaultCategoryId !== null && normalizePayee(merchant.name) === payee,
  );
  const merchant = merchantMatches.length === 1 ? merchantMatches[0] : null;
  return suggestionFromMatch(
    scoreMatch({
      mode: input.mode,
      recurring: null,
      amountRows,
      payeeRows: learnedRows(same),
      similar: input.similar,
      merchant: merchant?.defaultCategoryId ? { id: merchant.id, name: merchant.name, categoryId: merchant.defaultCategoryId } : null,
      transferRows: [],
    }),
  );
}

export function alternateSuggestion(input: Parameters<typeof suggestCategorization>[0]): Suggestion | null {
  const payee = normalizePayee(input.rawPayee);
  if (payee.length === 0) {
    return null;
  }
  const same = input.history.filter((row) => normalizePayee(row.payeeRaw) === payee);
  const amountRows = learnedRows(same.filter((row) => Math.abs(row.amount - input.amount) * 100 <= Math.max(Math.abs(row.amount), Math.abs(input.amount))));
  const merchantMatches = input.merchants.filter(
    (merchant) => merchant.archivedAt === null && merchant.defaultCategoryId !== null && normalizePayee(merchant.name) === payee,
  );
  const merchant = merchantMatches.length === 1 ? merchantMatches[0] : null;
  return alternateFromMatch(
    scoreMatch({
      mode: input.mode,
      recurring: null,
      amountRows,
      payeeRows: learnedRows(same),
      similar: input.similar,
      merchant: merchant?.defaultCategoryId ? { id: merchant.id, name: merchant.name, categoryId: merchant.defaultCategoryId } : null,
      transferRows: [],
    }),
  );
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

function pairAmount(group: TransferCandidate[]): TransferPair[] {
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
