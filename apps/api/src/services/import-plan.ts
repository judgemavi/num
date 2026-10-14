import { createHash } from "node:crypto";
import { normalizePayee, Temporal, type Suggestion } from "@num/shared";

export type PlanCandidate = {
  id: string;
  date: string;
  amount: number;
};

export type PlanInput = {
  date: string;
  amount: number;
  payeeRaw: string;
  bankId: string | null;
};

export type PlannedOutcome = "created" | "matched" | "duplicate" | "needs_review";

export type PlannedImportRow = PlanInput & {
  rowIndex: number;
  identity: string;
  outcome: PlannedOutcome;
  transactionId: string | null;
  suggestion: Suggestion | null;
};

function fingerprint(accountId: string, date: string, amount: number, payee: string, n: number) {
  const text = [accountId, date, String(amount), normalizePayee(payee), String(n)].join("\u001f");
  return `fp:${createHash("sha256").update(text).digest("hex")}`;
}

function withinThreeDays(left: string, right: string) {
  const days = Temporal.PlainDate.from(left).until(Temporal.PlainDate.from(right), { largestUnit: "day" }).days;
  return Math.abs(days) <= 3;
}

export function planImportRows(
  accountId: string,
  rows: readonly PlanInput[],
  taken: ReadonlySet<string>,
  candidates: readonly PlanCandidate[],
): PlannedImportRow[] {
  const seen = new Set(taken);
  const pool = candidates.map((item) => ({ ...item }));
  const position = new Map<string, number>();
  const planned: PlannedImportRow[] = [];

  rows.forEach((row, rowIndex) => {
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

    const base = { ...row, bankId, rowIndex, identity, suggestion: null };
    if (seen.has(identity)) {
      planned.push({ ...base, outcome: "duplicate", transactionId: null });
      return;
    }
    seen.add(identity);

    const matches = pool.filter((item) => item.amount === row.amount && withinThreeDays(item.date, row.date));
    const match = matches.length === 1 ? matches[0] : undefined;
    if (matches.length > 1 || !match) {
      planned.push({
        ...base,
        outcome: matches.length > 1 ? "needs_review" : "created",
        transactionId: null,
      });
      return;
    }

    const index = pool.findIndex((item) => item.id === match.id);
    if (index >= 0) {
      pool.splice(index, 1);
    }
    planned.push({ ...base, outcome: "matched", transactionId: match.id });
  });

  return planned;
}
