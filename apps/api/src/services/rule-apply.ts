import { transactionLines, transactions } from "@num/db";
import { normalizePayee, patternHits, type RuleApplyPreview, type RuleMatch } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { requireRule } from "./rules";
import { auditTransaction, readTransaction } from "./transaction-record";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

type LineRow = typeof transactionLines.$inferSelect;
type TxnRow = typeof transactions.$inferSelect;

const sampleSize = 5;

function linesByTransaction(rows: LineRow[]): Map<string, LineRow[]> {
  const grouped = new Map<string, LineRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.transactionId) ?? [];
    list.push(row);
    grouped.set(row.transactionId, list);
  }
  return grouped;
}

function matches(rule: { match: string; pattern: string; accountId: string | null }, txn: TxnRow): boolean {
  if (rule.accountId && rule.accountId !== txn.accountId) {
    return false;
  }
  return patternHits(rule.match as RuleMatch, rule.pattern, normalizePayee(txn.payeeRaw));
}

function wouldChange(
  rule: { merchantId: string | null; categoryId: string | null },
  txn: TxnRow,
  lines: LineRow[],
): boolean {
  if (rule.merchantId && txn.merchantId !== rule.merchantId) {
    return true;
  }
  if (!rule.categoryId) {
    return false;
  }
  return lines.some((line) => line.transferAccountId === null && line.categoryId !== rule.categoryId);
}

function eligible(rule: ReturnType<typeof requireRule>, txns: TxnRow[], grouped: Map<string, LineRow[]>) {
  return txns
    .filter((txn) => txn.deletedAt === null && txn.status !== "reconciled" && matches(rule, txn))
    .filter((txn) => wouldChange(rule, txn, grouped.get(txn.id) ?? []))
    .sort((left, right) => (left.date < right.date ? 1 : left.date > right.date ? -1 : left.id < right.id ? 1 : -1));
}

function previewOf(rows: TxnRow[]): RuleApplyPreview {
  return {
    count: rows.length,
    sample: rows.slice(0, sampleSize).map((row) => ({
      id: row.id,
      date: row.date,
      payeeRaw: row.payeeRaw,
      amount: row.amount,
    })),
  };
}

export function previewRuleApply(db: Db, id: string): RuleApplyPreview {
  const rule = requireRule(db, id);
  if (rule.archivedAt) {
    throw new ServiceError("rule_archived", 409);
  }
  const grouped = linesByTransaction(db.select().from(transactionLines).all());
  return previewOf(eligible(rule, db.select().from(transactions).all(), grouped));
}

function applyOne(tx: WriteTx, txn: TxnRow, lines: LineRow[], merchantId: string | null, categoryId: string | null) {
  const before = readTransaction(tx, txn.id);
  if (merchantId && txn.merchantId !== merchantId) {
    tx.update(transactions).set({ merchantId }).where(eq(transactions.id, txn.id)).run();
  }
  if (categoryId) {
    for (const line of lines) {
      if (line.transferAccountId === null && line.categoryId !== categoryId) {
        tx.update(transactionLines).set({ categoryId }).where(eq(transactionLines.id, line.id)).run();
      }
    }
  }
  auditTransaction(tx, txn.id, "update", before, readTransaction(tx, txn.id));
}

export function applyRule(db: Db, id: string, input: WriteInput): RuleApplyPreview {
  let preview: RuleApplyPreview | undefined;
  const rule = requireRule(db, id);
  if (rule.archivedAt) {
    throw new ServiceError("rule_archived", 409);
  }
  const grouped = linesByTransaction(db.select().from(transactionLines).all());
  const rows = eligible(rule, db.select().from(transactions).all(), grouped);
  preview = previewOf(rows);
  if (rows.length === 0) {
    return preview;
  }
  write(db, { source: input.source, at: input.at }, (tx) => {
    for (const txn of rows) {
      applyOne(tx, txn, grouped.get(txn.id) ?? [], rule.merchantId, rule.categoryId);
    }
    tx.audit({
      entity: "rules",
      entityId: id,
      action: "apply",
      before: null,
      after: { transactionIds: rows.map((row) => row.id) },
    });
  });
  return preview;
}
