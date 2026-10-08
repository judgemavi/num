import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { dayDistance } from "./recurring-calc";
import { normalizePayee } from "./payee";
import { chooseRule, ruleCoversPayee, type RulePattern } from "./rule";

export const suggestionReasons = ["rule", "payee_history", "merchant_default", "none"] as const;

export type SuggestionReason = (typeof suggestionReasons)[number];

export const suggestionSchema = z.object({
  merchantId: z.uuid().nullable(),
  categoryId: z.uuid().nullable(),
  transferAccountId: z.uuid().nullable(),
  reason: z.enum(suggestionReasons),
});

export const suggestionQuerySchema = z.object({
  accountId: z.uuid(),
  payee: z.string().trim().min(1),
});

export const promotionSchema = z.object({
  payee: z.string(),
  merchantId: z.uuid(),
  categoryId: z.uuid(),
  count: z.number().int(),
});

export const promotionListSchema = z.object({
  items: z.array(promotionSchema),
});

export const promotionAcceptSchema = z.object({
  payee: z.string().trim().min(1),
  merchantId: z.uuid(),
  categoryId: z.uuid(),
});

export const transferPairSchema = z.object({
  leftId: z.uuid(),
  rightId: z.uuid(),
});

export const transferPairListSchema = z.object({
  items: z.array(transferPairSchema),
});

export type Suggestion = z.infer<typeof suggestionSchema>;
export type Promotion = z.infer<typeof promotionSchema>;
export type TransferPair = z.infer<typeof transferPairSchema>;

export type HistoryRow = {
  id: string;
  date: string;
  payeeRaw: string;
  merchantId: string | null;
  categoryId: string | null;
};

export type MerchantChoice = {
  id: string;
  name: string;
  defaultCategoryId: string | null;
  archivedAt: string | null;
};

const none: Suggestion = { merchantId: null, categoryId: null, transferAccountId: null, reason: "none" };

function agreedId(ids: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const id of ids) {
    if (!id) {
      continue;
    }
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }
  if (!best || bestCount / ids.length < 0.8) {
    return null;
  }
  return best;
}

export function historySuggestion(rows: HistoryRow[]): { merchantId: string | null; categoryId: string } | null {
  const categorized = rows
    .filter((row) => row.categoryId !== null)
    .sort((left, right) => {
      if (left.date !== right.date) {
        return left.date < right.date ? 1 : -1;
      }
      return left.id < right.id ? 1 : -1;
    })
    .slice(0, 10);
  const categoryId = agreedId(categorized.map((row) => row.categoryId));
  if (!categoryId) {
    return null;
  }
  return {
    categoryId,
    merchantId: agreedId(categorized.map((row) => row.merchantId)),
  };
}

function merchantDefault(merchants: MerchantChoice[], normalizedPayee: string): MerchantChoice | null {
  const matches = merchants.filter(
    (merchant) =>
      merchant.archivedAt === null &&
      merchant.defaultCategoryId !== null &&
      normalizePayee(merchant.name) === normalizedPayee,
  );
  return matches.length === 1 ? (matches[0] ?? null) : null;
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
    };
  }
  const history = historySuggestion(input.history.filter((row) => normalizePayee(row.payeeRaw) === payee));
  if (history) {
    return { merchantId: history.merchantId, categoryId: history.categoryId, transferAccountId: null, reason: "payee_history" };
  }
  const merchant = merchantDefault(input.merchants, payee);
  if (merchant?.defaultCategoryId) {
    return {
      merchantId: merchant.id,
      categoryId: merchant.defaultCategoryId,
      transferAccountId: null,
      reason: "merchant_default",
    };
  }
  return none;
}

export function promotionCandidates(
  rows: HistoryRow[],
  rules: Pick<RulePattern, "match" | "pattern" | "archivedAt">[],
  promoteAfter: number,
): Promotion[] {
  if (!Number.isInteger(promoteAfter) || promoteAfter < 1) {
    return [];
  }
  const counts = new Map<string, Promotion>();
  for (const row of rows) {
    if (!row.merchantId || !row.categoryId) {
      continue;
    }
    const payee = normalizePayee(row.payeeRaw);
    if (payee.length === 0) {
      continue;
    }
    const key = `${payee}\0${row.merchantId}\0${row.categoryId}`;
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, { payee, merchantId: row.merchantId, categoryId: row.categoryId, count: 1 });
    }
  }
  return [...counts.values()]
    .filter((item) => item.count >= promoteAfter && !ruleCoversPayee(rules, item.payee))
    .sort((left, right) => right.count - left.count || (left.payee < right.payee ? -1 : left.payee > right.payee ? 1 : 0));
}

export type TransferCandidate = {
  id: string;
  accountId: string;
  onBudget: boolean;
  date: string;
  amount: number;
  linked: boolean;
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
