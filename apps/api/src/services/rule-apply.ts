import { transactionLines, transactions } from "@num/db";
import { type RuleApplyPreview, type RuleMatch } from "@num/shared";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { requireRule } from "./rules";
import { attachTransfer } from "./transaction-transfer";
import { auditTransaction, readTransaction } from "./transaction-record";
import { replaceLines } from "./transaction-lines";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

type ApplyRow = {
  id: string;
  date: string;
  payeeRaw: string;
  amount: number;
  accountId: string;
  status: string;
  merchantId: string | null;
  lineId: string;
  categoryId: string | null;
};

const sampleSize = 5;

function patternClause(match: RuleMatch, pattern: string) {
  const needle = pattern.trim().replace(/\s+/g, " ").toUpperCase();
  const escaped = needle.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
  if (match === "exact") {
    return sql`t.payee_normalized = ${needle}`;
  }
  if (match === "prefix") {
    return sql`t.payee_normalized like ${`${escaped}%`} escape '\\'`;
  }
  return sql`t.payee_normalized like ${`%${escaped}%`} escape '\\'`;
}

function eligible(db: Db, rule: ReturnType<typeof requireRule>): ApplyRow[] {
  const accountClause = rule.accountId ? sql`and t.account_id = ${rule.accountId}` : sql``;
  const rows = db.all<ApplyRow>(sql`
    select
      t.id as id,
      t.date as date,
      t.payee_raw as payeeRaw,
      t.amount as amount,
      t.account_id as accountId,
      t.status as status,
      t.merchant_id as merchantId,
      l.id as lineId,
      l.category_id as categoryId
    from transactions t
    inner join transaction_lines l on l.transaction_id = t.id
    where t.deleted_at is null
      and l.transfer_account_id is null
      and (select count(*) from transaction_lines x where x.transaction_id = t.id) = 1
      and ${patternClause(rule.match as RuleMatch, rule.pattern)}
      ${accountClause}
    order by t.date desc, t.id desc
  `);
  return rows.filter((row) => {
    if (rule.transferAccountId) {
      return row.status !== "reconciled" && row.accountId !== rule.transferAccountId;
    }
    if (rule.merchantId && row.merchantId !== rule.merchantId) {
      return true;
    }
    return rule.categoryId !== null && row.categoryId !== rule.categoryId;
  });
}

function previewOf(rows: ApplyRow[]): RuleApplyPreview {
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
  return previewOf(eligible(db, rule));
}

function applyOne(tx: WriteTx, row: ApplyRow, rule: ReturnType<typeof requireRule>) {
  const before = readTransaction(tx, row.id);
  if (rule.transferAccountId) {
    const merchantId = rule.merchantId ?? before.merchantId;
    const line = {
      amount: before.amount,
      memo: before.lines[0]?.memo ?? null,
      categoryId: null,
      transferAccountId: rule.transferAccountId,
      tagIds: before.lines[0]?.tagIds ?? [],
    };
    tx.update(transactions).set({ merchantId, autoReason: null, autoSourceId: null }).where(eq(transactions.id, row.id)).run();
    replaceLines(tx, row.id, [line]);
    attachTransfer(tx, row.id, {
      accountId: before.accountId,
      date: before.date,
      amount: before.amount,
      merchantId,
      notes: before.notes,
      payeeRaw: before.payeeRaw,
      payeeNormalized: before.payeeNormalized,
      status: before.status === "cleared" ? "cleared" : "open",
    }, before.source, line);
    auditTransaction(tx, row.id, "update", before, readTransaction(tx, row.id));
    return;
  }
  if (rule.categoryId) {
    tx.update(transactions)
      .set({
        merchantId: rule.merchantId ?? row.merchantId,
        autoReason: "rule",
        autoSourceId: rule.id,
      })
      .where(eq(transactions.id, row.id))
      .run();
    if (row.categoryId !== rule.categoryId) {
      tx.update(transactionLines).set({ categoryId: rule.categoryId }).where(eq(transactionLines.id, row.lineId)).run();
    }
  } else if (rule.merchantId && row.merchantId !== rule.merchantId) {
    tx.update(transactions)
      .set({ merchantId: rule.merchantId, autoReason: null, autoSourceId: null })
      .where(eq(transactions.id, row.id))
      .run();
  }
  auditTransaction(tx, row.id, "update", before, readTransaction(tx, row.id));
}

export function applyRule(db: Db, id: string, input: WriteInput): RuleApplyPreview {
  let preview: RuleApplyPreview | undefined;
  const rule = requireRule(db, id);
  if (rule.archivedAt) {
    throw new ServiceError("rule_archived", 409);
  }
  const rows = eligible(db, rule);
  preview = previewOf(rows);
  if (rows.length === 0) {
    return preview;
  }
  write(db, { source: input.source, at: input.at }, (tx) => {
    for (const txn of rows) {
      applyOne(tx, txn, rule);
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
