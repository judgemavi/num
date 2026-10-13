import { recurringPlans, transactions } from "@num/db";
import {
  autoReasons,
  refundOfIdAfterEdit,
  storedPayee,
  transactionInputStatuses,
  transactionSources,
  transactionStatuses,
  type AutoReason,
  type Transaction,
  type TransactionCreate,
  type TransactionInputStatus,
  type TransactionSource,
  type TransactionStatus,
} from "@num/shared";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { loadLines, type StoredLine } from "./transaction-lines";
import { transactionReconciled } from "./reconciled";
import { blankToNull, requireText } from "./transaction-rules";
import type { WriteTx } from "./write";

export type TxRow = typeof transactions.$inferSelect;
export type Reader = Db | WriteTx;

export type Header = {
  accountId: string;
  date: string;
  amount: number;
  merchantId: string | null;
  notes: string | null;
  payeeRaw: string;
  payeeNormalized: string;
  status: TransactionInputStatus;
  refundOfId?: string | null;
};

export type TransactionBody = Omit<TransactionCreate, "status"> & { status: string };

function asStatus(value: string): TransactionStatus {
  if (!(transactionStatuses as readonly string[]).includes(value)) {
    throw new Error("Unknown transaction status");
  }
  return value as TransactionStatus;
}

function asSource(value: string): TransactionSource {
  if (!(transactionSources as readonly string[]).includes(value)) {
    throw new Error("Unknown transaction source");
  }
  return value as TransactionSource;
}

function asAutoReason(value: string | null): AutoReason | null {
  if (value && (autoReasons as readonly string[]).includes(value)) {
    return value as AutoReason;
  }
  return null;
}

function labelFacts(db: Reader, row: TxRow): { autoSourceName: string | null; autoLearnedCount: number | null } {
  if (!row.autoReason) {
    return { autoSourceName: null, autoLearnedCount: null };
  }
  let autoSourceName: string | null = null;
  if (row.autoReason === "recurring" && row.autoSourceId) {
    autoSourceName = db.select({ name: recurringPlans.name }).from(recurringPlans).where(eq(recurringPlans.id, row.autoSourceId)).get()?.name ?? null;
  } else if (row.autoSourceId) {
    autoSourceName = db.select({ payee: transactions.payeeNormalized }).from(transactions).where(eq(transactions.id, row.autoSourceId)).get()?.payee ?? null;
  }
  const counted = db.all<{ total: number }>(sql`
    select count(*) as total
    from transactions t
    inner join transaction_lines l on l.transaction_id = t.id
    where t.auto_reason is null
      and t.payee_normalized = ${row.payeeNormalized}
      and l.category_id is not null
      and l.transfer_account_id is null
  `);
  return { autoSourceName, autoLearnedCount: Number(counted[0]?.total ?? 0) };
}

export function recordSource(source: "ui" | TransactionSource): TransactionSource {
  if (source === "ui") {
    return "manual";
  }
  return source;
}

function inputStatus(status: string): TransactionInputStatus {
  if ((transactionInputStatuses as readonly string[]).includes(status)) {
    return status as TransactionInputStatus;
  }
  throw new ServiceError("transaction_status_invalid", 400);
}

export function headerFrom(input: TransactionBody): Header {
  return {
    accountId: input.accountId,
    date: input.date,
    amount: input.amount,
    merchantId: input.merchantId ?? null,
    notes: blankToNull(input.notes),
    ...storedPayee(requireText(input.payeeRaw, "payeeRaw")),
    status: inputStatus(input.status),
    ...(input.refundOfId === undefined ? {} : { refundOfId: input.refundOfId }),
  };
}

export function headerForWrite(existingRefundOfId: string | null, header: Header): Header {
  return {
    ...header,
    refundOfId: refundOfIdAfterEdit(existingRefundOfId, header.refundOfId),
  };
}

function refundFacts(db: Reader, row: TxRow): {
  refundOf: { id: string; date: string; amount: number; payeeRaw: string } | null;
  refundedAmount: number | null;
} {
  let refundOf: { id: string; date: string; amount: number; payeeRaw: string } | null = null;
  if (row.refundOfId) {
    const purchase = db
      .select({
        id: transactions.id,
        date: transactions.date,
        amount: transactions.amount,
        payeeRaw: transactions.payeeRaw,
      })
      .from(transactions)
      .where(eq(transactions.id, row.refundOfId))
      .get();
    if (purchase) {
      refundOf = { id: purchase.id, date: purchase.date, amount: purchase.amount, payeeRaw: purchase.payeeRaw };
    }
  }
  const linked = db
    .select({ amount: transactions.amount })
    .from(transactions)
    .where(eq(transactions.refundOfId, row.id))
    .all();
  if (linked.length === 0) {
    return { refundOf, refundedAmount: null };
  }
  const total = linked.reduce((sum, item) => sum + item.amount, 0);
  if (!Number.isSafeInteger(total) || total === 0) {
    return { refundOf, refundedAmount: null };
  }
  return { refundOf, refundedAmount: total };
}

export function toTransaction(db: Reader, row: TxRow, lines: StoredLine[]): Transaction {
  return {
    id: row.id,
    accountId: row.accountId,
    date: row.date,
    amount: row.amount,
    merchantId: row.merchantId,
    notes: row.notes,
    payeeRaw: row.payeeRaw,
    payeeNormalized: row.payeeNormalized,
    status: asStatus(row.status),
    reconciled: transactionReconciled(db, row.accountId, row.date),
    source: asSource(row.source),
    importRowId: row.importRowId,
    transferPeerId: row.transferPeerId,
    mirror: row.mirror,
    autoReason: asAutoReason(row.autoReason),
    autoSourceId: row.autoSourceId,
    autoConfidence: row.autoConfidence,
    ...labelFacts(db, row),
    refundOfId: row.refundOfId,
    ...refundFacts(db, row),
    lines,
  };
}

function snapshot(record: Transaction) {
  return {
    accountId: record.accountId,
    date: record.date,
    amount: record.amount,
    merchantId: record.merchantId,
    notes: record.notes,
    payeeRaw: record.payeeRaw,
    payeeNormalized: record.payeeNormalized,
    status: record.status,
    reconciled: record.reconciled,
    source: record.source,
    importRowId: record.importRowId,
    transferPeerId: record.transferPeerId,
    mirror: record.mirror,
    autoReason: record.autoReason,
    autoSourceId: record.autoSourceId,
    autoConfidence: record.autoConfidence,
    refundOfId: record.refundOfId,
    lines: record.lines.map((line) => ({
      id: line.id,
      amount: line.amount,
      memo: line.memo,
      categoryId: line.categoryId,
      transferAccountId: line.transferAccountId,
      tagIds: line.tagIds,
    })),
  };
}

export function readTransaction(db: Reader, id: string): Transaction {
  const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!row) {
    throw new Error("Transaction is missing");
  }
  return toTransaction(db, row, loadLines(db, id));
}

export function auditTransaction(
  tx: WriteTx,
  id: string,
  action: string,
  before: Transaction | null,
  after: Transaction | null,
  extra?: Record<string, string | null>,
): void {
  tx.audit({
    entity: "transactions",
    entityId: id,
    action,
    before: before ? snapshot(before) : null,
    after: after ? { ...snapshot(after), ...extra } : null,
  });
}

/** A peer that only the app linked (no edit by the person) stays unedited when the link goes away, so its import can be undone. */
export function automaticPair(peer: TxRow): boolean {
  return peer.autoReason === "transfer_match" && peer.editedAt === null;
}
