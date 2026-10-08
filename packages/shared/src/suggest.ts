import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { dayDistance } from "./recurring-calc";
import { normalizePayee } from "./payee";
import { learnedPayee, type Confirmation } from "./learned";
import { chooseRule, type RulePattern } from "./rule";

export const suggestionReasons = ["rule", "payee_history", "merchant_default", "none"] as const;

export type SuggestionReason = (typeof suggestionReasons)[number];

export const suggestionSchema = z.object({
  merchantId: z.uuid().nullable(),
  categoryId: z.uuid().nullable(),
  transferAccountId: z.uuid().nullable(),
  reason: z.enum(suggestionReasons),
  sure: z.boolean(),
  sourceId: z.uuid().nullable(),
});

export const suggestionQuerySchema = z.object({
  accountId: z.uuid(),
  payee: z.string().trim().min(1),
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
};

function merchantDefault(merchants: MerchantChoice[], normalizedPayee: string): MerchantChoice | null {
  const matches = merchants.filter(
    (merchant) =>
      merchant.archivedAt === null &&
      merchant.defaultCategoryId !== null &&
      normalizePayee(merchant.name) === normalizedPayee,
  );
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function rankedCategories(rows: HistoryRow[]): { categoryId: string; merchantId: string | null }[] {
  const categorized = rows
    .filter((row) => row.categoryId !== null)
    .sort((left, right) => {
      if (left.date !== right.date) {
        return left.date < right.date ? 1 : -1;
      }
      return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
    })
    .slice(0, 10);
  const counts = new Map<string, { categoryId: string; merchantId: string | null; count: number }>();
  for (const row of categorized) {
    if (!row.categoryId) {
      continue;
    }
    const current = counts.get(row.categoryId);
    if (current) {
      current.count += 1;
    } else {
      counts.set(row.categoryId, { categoryId: row.categoryId, merchantId: row.merchantId, count: 1 });
    }
  }
  return [...counts.values()]
    .sort((left, right) => right.count - left.count || (left.categoryId < right.categoryId ? -1 : 1))
    .map((row) => ({ categoryId: row.categoryId, merchantId: row.merchantId }));
}

export function suggestCategorization(input: {
  accountId: string;
  rawPayee: string;
  rules: RulePattern[];
  history: HistoryRow[];
  merchants: MerchantChoice[];
}): Suggestion {
  const payee = normalizePayee(input.rawPayee);
  if (payee.length === 0) {
    return none;
  }
  const rule = chooseRule(input.rules, payee, input.accountId);
  if (rule) {
    return {
      merchantId: rule.merchantId,
      categoryId: rule.transferAccountId ? null : rule.categoryId,
      transferAccountId: rule.transferAccountId,
      reason: "rule",
      sure: rule.transferAccountId === null && rule.categoryId !== null,
      sourceId: rule.id,
    };
  }
  const confirmations: Confirmation[] = input.history
    .filter((row) => normalizePayee(row.payeeRaw) === payee && row.categoryId !== null && !row.transferAccountId)
    .map((row) => ({ id: row.id, date: row.date, categoryId: row.categoryId ?? "", merchantId: row.merchantId }));
  const learned = learnedPayee(confirmations);
  if ("categoryId" in learned) {
    return {
      merchantId: learned.merchantId,
      categoryId: learned.categoryId,
      transferAccountId: null,
      reason: "payee_history",
      sure: learned.level === "sure",
      sourceId: learned.sourceId,
    };
  }
  const merchant = merchantDefault(input.merchants, payee);
  if (merchant?.defaultCategoryId) {
    return {
      merchantId: merchant.id,
      categoryId: merchant.defaultCategoryId,
      transferAccountId: null,
      reason: "merchant_default",
      sure: false,
      sourceId: null,
    };
  }
  return none;
}

/** The next category or transfer after the suggestion, when one exists. */
export function alternateSuggestion(input: {
  accountId: string;
  rawPayee: string;
  rules: RulePattern[];
  history: HistoryRow[];
  merchants: MerchantChoice[];
}): Suggestion | null {
  const primary = suggestCategorization(input);
  const primaryTarget = primary.transferAccountId ?? primary.categoryId;
  if (!primaryTarget) {
    return null;
  }
  const payee = normalizePayee(input.rawPayee);
  const ranked = rankedCategories(input.history.filter((row) => normalizePayee(row.payeeRaw) === payee));
  const merchant = merchantDefault(input.merchants, payee);
  const candidates: Suggestion[] = [];
  for (const row of ranked) {
    if (row.categoryId !== primary.categoryId) {
      candidates.push({
        merchantId: row.merchantId,
        categoryId: row.categoryId,
        transferAccountId: null,
        reason: "payee_history",
        sure: false,
        sourceId: null,
      });
    }
  }
  if (merchant?.defaultCategoryId && merchant.defaultCategoryId !== primary.categoryId) {
    candidates.push({
      merchantId: merchant.id,
      categoryId: merchant.defaultCategoryId,
      transferAccountId: null,
      reason: "merchant_default",
      sure: false,
      sourceId: null,
    });
  }
  return candidates[0] ?? null;
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
