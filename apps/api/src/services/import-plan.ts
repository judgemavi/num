import { createHash } from "node:crypto";
import { normalizePayee, dayDistance, matchDateWindowDays, type ImportRowOutcome, type Suggestion } from "@num/shared";

export type PlanCandidate = {
  id: string;
  date: string;
  amount: number;
  payeeNormalized: string;
};

export type PlanInput = {
  date: string;
  amount: number;
  payeeRaw: string;
  bankId: string | null;
};

export type PlannedImportRow = PlanInput & {
  rowIndex: number;
  identity: string;
  outcome: Exclude<ImportRowOutcome, "ignored">;
  transactionId: string | null;
  suggestion: Suggestion | null;
};

function fingerprint(accountId: string, date: string, amount: number, payee: string, n: number) {
  const text = [accountId, date, String(amount), normalizePayee(payee), String(n)].join("\u001f");
  return `fp:${createHash("sha256").update(text).digest("hex")}`;
}

function withinThreeDays(left: string, right: string) {
  return dayDistance(left, right) <= matchDateWindowDays;
}

/** A candidate of a row: the same amount, a date within ±3 days. */
export function isMatchCandidate(item: { date: string; amount: number }, row: { date: string; amount: number }) {
  return item.amount === row.amount && withinThreeDays(item.date, row.date);
}

/** The rows with their identity. A row with the identity of an active row, or of an earlier row of the file, is a duplicate. */
function identifyRows(accountId: string, rows: readonly PlanInput[], taken: ReadonlySet<string>): PlannedImportRow[] {
  const seen = new Set(taken);
  const position = new Map<string, number>();
  return rows.map((row, rowIndex) => {
    const bankId = row.bankId && row.bankId.trim().length > 0 ? row.bankId.trim() : null;
    let identity: string;
    if (bankId) {
      identity = `bank:${bankId}`;
    } else {
      const key = `${row.date}\u001f${row.amount}\u001f${normalizePayee(row.payeeRaw)}`;
      const n = position.get(key) ?? 0;
      position.set(key, n + 1);
      identity = fingerprint(accountId, row.date, row.amount, row.payeeRaw, n);
    }
    const duplicate = seen.has(identity);
    seen.add(identity);
    return {
      ...row,
      bankId,
      rowIndex,
      identity,
      suggestion: null,
      outcome: duplicate ? "duplicate" : "created",
      transactionId: null,
    };
  });
}

/**
 * The outcome of each row (spec §7.2). First the payee: a row links to the one candidate with its normalized payee.
 * Then the amount and the date: one candidate links, more than one needs review. A row with a held candidate (a
 * candidate of an open review) needs review. A candidate links to at most one row. The rows go in file order.
 */
export function planImportRows(
  accountId: string,
  rows: readonly PlanInput[],
  taken: ReadonlySet<string>,
  candidates: readonly PlanCandidate[],
  held: ReadonlySet<string>,
): PlannedImportRow[] {
  const planned = identifyRows(accountId, rows, taken);
  const open = planned.filter((row) => row.outcome !== "duplicate");
  const hold = new Set(held);
  const linked = new Set<string>();
  const candidatesOf = (row: PlannedImportRow) =>
    candidates.filter((item) => !linked.has(item.id) && isMatchCandidate(item, row));
  const link = (row: PlannedImportRow, id: string) => {
    row.outcome = "matched";
    row.transactionId = id;
    linked.add(id);
  };

  const rest = open.filter((row) => {
    const matches = candidatesOf(row);
    if (matches.some((item) => hold.has(item.id))) {
      return true;
    }
    const payee = normalizePayee(row.payeeRaw);
    const same = matches.filter((item) => item.payeeNormalized === payee);
    const only = same.length === 1 ? same[0] : undefined;
    if (!only) {
      return true;
    }
    link(row, only.id);
    return false;
  });

  for (const row of rest) {
    const matches = candidatesOf(row);
    const only = matches.length === 1 ? matches[0] : undefined;
    if (only && !hold.has(only.id)) {
      link(row, only.id);
    } else if (matches.length > 0) {
      row.outcome = "needs_review";
      for (const item of matches) {
        hold.add(item.id);
      }
    }
  }
  return planned;
}
