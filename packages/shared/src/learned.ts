import { normalizePayee } from "./payee";
import { chooseRule, type RulePattern } from "./rule";

export const autoReasons = ["rule", "learned"] as const;

export type AutoReason = (typeof autoReasons)[number];

export type Confirmation = {
  id: string;
  date: string;
  categoryId: string;
  merchantId: string | null;
};

export type LearnedPayee =
  | {
      level: "sure" | "suggestion";
      categoryId: string;
      merchantId: string | null;
      sourceId: string;
      sourceDate: string;
    }
  | { level: "conflict" };

export type AutomaticLabel = {
  reason: AutoReason;
  sourceId: string;
  categoryId: string;
  merchantId: string | null;
};

function newestFirst(left: { date: string; id: string }, right: { date: string; id: string }): number {
  if (left.date !== right.date) {
    return left.date < right.date ? 1 : -1;
  }
  return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
}

/** Last 10 confirmations. All agree is sure. 80% or more is a suggestion. Less is a conflict. */
export function learnedPayee(rows: readonly Confirmation[]): LearnedPayee {
  const last = [...rows].sort(newestFirst).slice(0, 10);
  if (last.length === 0) {
    return { level: "conflict" };
  }
  const groups = new Map<string, { row: Confirmation; count: number }>();
  for (const row of last) {
    const key = `${row.categoryId}\0${row.merchantId ?? ""}`;
    const current = groups.get(key);
    if (current) {
      current.count += 1;
    } else {
      groups.set(key, { row, count: 1 });
    }
  }
  let best: { row: Confirmation; count: number } | null = null;
  for (const group of groups.values()) {
    if (!best || group.count > best.count) {
      best = group;
    }
  }
  if (!best) {
    return { level: "conflict" };
  }
  const agreed = {
    categoryId: best.row.categoryId,
    merchantId: best.row.merchantId,
    sourceId: best.row.id,
    sourceDate: best.row.date,
  };
  if (best.count === last.length) {
    return { level: "sure", ...agreed };
  }
  if (best.count / last.length >= 0.8) {
    return { level: "suggestion", ...agreed };
  }
  return { level: "conflict" };
}

export function automaticLabel(input: {
  accountId: string;
  rawPayee: string;
  rules: RulePattern[];
  confirmations: readonly Confirmation[];
}): AutomaticLabel | null {
  const payee = normalizePayee(input.rawPayee);
  if (payee.length === 0) {
    return null;
  }
  const rule = chooseRule(input.rules, payee, input.accountId);
  if (rule) {
    if (rule.transferAccountId !== null || rule.categoryId === null) {
      return null;
    }
    return { reason: "rule", sourceId: rule.id, categoryId: rule.categoryId, merchantId: rule.merchantId };
  }
  const learned = learnedPayee(input.confirmations);
  if (learned.level !== "sure") {
    return null;
  }
  return {
    reason: "learned",
    sourceId: learned.sourceId,
    categoryId: learned.categoryId,
    merchantId: learned.merchantId,
  };
}

export function storedAutomatic(suggestion: {
  merchantId: string | null;
  categoryId: string | null;
  transferAccountId: string | null;
  reason: string;
  sure: boolean;
  sourceId: string | null;
} | null): {
  merchantId: string | null;
  categoryId: string | null;
  autoReason: AutoReason | null;
  autoSourceId: string | null;
} {
  const empty = { merchantId: null, categoryId: null, autoReason: null, autoSourceId: null };
  if (!suggestion?.sure || suggestion.transferAccountId !== null || suggestion.categoryId === null || suggestion.sourceId === null) {
    return empty;
  }
  if (suggestion.reason === "rule") {
    return { merchantId: suggestion.merchantId, categoryId: suggestion.categoryId, autoReason: "rule", autoSourceId: suggestion.sourceId };
  }
  if (suggestion.reason === "payee_history") {
    return { merchantId: suggestion.merchantId, categoryId: suggestion.categoryId, autoReason: "learned", autoSourceId: suggestion.sourceId };
  }
  return empty;
}
