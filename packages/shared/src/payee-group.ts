import type { Suggestion } from "./suggest";

export type PayeeGroupRow = {
  transactionId: string;
  date: string;
  amount: number;
  payeeRaw: string;
  payee: string;
  suggestion: Suggestion;
};

export type PayeeGroup = {
  payee: string;
  payeeRaw: string;
  date: string;
  count: number;
  total: number;
  transactionIds: string[];
  suggestion: Suggestion;
};

const none: Suggestion = { merchantId: null, categoryId: null, transferAccountId: null, reason: "none" };

function suggestionKey(suggestion: Suggestion): string {
  return `${suggestion.categoryId ?? ""}\0${suggestion.transferAccountId ?? ""}\0${suggestion.merchantId ?? ""}\0${suggestion.reason}`;
}

function later(left: PayeeGroupRow, right: PayeeGroupRow): PayeeGroupRow {
  if (left.date !== right.date) {
    return left.date > right.date ? left : right;
  }
  return left.transactionId > right.transactionId ? left : right;
}

/** One inbox item per normalized payee. The item key is the payee. */
export function groupByPayee(rows: readonly PayeeGroupRow[]): PayeeGroup[] {
  const groups = new Map<string, PayeeGroupRow[]>();
  for (const row of rows) {
    const current = groups.get(row.payee) ?? [];
    current.push(row);
    groups.set(row.payee, current);
  }
  const items: PayeeGroup[] = [];
  for (const [payee, members] of groups) {
    const byId = new Map<string, PayeeGroupRow>();
    for (const member of members) {
      const previous = byId.get(member.transactionId);
      byId.set(member.transactionId, previous ? later(previous, member) : member);
    }
    const unique = [...byId.values()];
    const counts = new Map<string, { suggestion: Suggestion; count: number; latest: PayeeGroupRow }>();
    let latest = unique[0];
    if (!latest) {
      continue;
    }
    for (const member of unique) {
      latest = later(latest, member);
      const key = suggestionKey(member.suggestion);
      const current = counts.get(key);
      if (current) {
        current.count += 1;
        current.latest = later(current.latest, member);
      } else {
        counts.set(key, { suggestion: member.suggestion, count: 1, latest: member });
      }
    }
    let best = { suggestion: none, count: 0, latest };
    for (const candidate of counts.values()) {
      const newer = candidate.latest === later(candidate.latest, best.latest) && candidate.latest !== best.latest;
      if (candidate.count > best.count || (candidate.count === best.count && newer)) {
        best = candidate;
      }
    }
    unique.sort((left, right) => {
      if (left.date !== right.date) {
        return left.date < right.date ? 1 : -1;
      }
      return left.transactionId < right.transactionId ? 1 : left.transactionId > right.transactionId ? 1 : 0;
    });
    items.push({
      payee,
      payeeRaw: latest.payeeRaw,
      date: latest.date,
      count: unique.length,
      total: unique.reduce((sum, member) => sum + member.amount, 0),
      transactionIds: unique.map((member) => member.transactionId),
      suggestion: best.suggestion,
    });
  }
  return items;
}

export function uncategorizedItemKey(payee: string): string {
  return `uncategorized:${payee}`;
}
