import { transactions } from "@num/db";
import {
  transactionInputStatuses,
  transactionSources,
  transactionStatuses,
  type Transaction,
  type TransactionCreate,
  type TransactionInputStatus,
  type TransactionSource,
  type TransactionStatus,
} from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { loadLines, type StoredLine } from "./transaction-lines";
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
  status: TransactionInputStatus;
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
    payeeRaw: requireText(input.payeeRaw, "payeeRaw"),
    status: inputStatus(input.status),
  };
}

export function toTransaction(row: TxRow, lines: StoredLine[]): Transaction {
  return {
    id: row.id,
    accountId: row.accountId,
    date: row.date,
    amount: row.amount,
    merchantId: row.merchantId,
    notes: row.notes,
    payeeRaw: row.payeeRaw,
    status: asStatus(row.status),
    source: asSource(row.source),
    importRowId: row.importRowId,
    transferPeerId: row.transferPeerId,
    deletedAt: row.deletedAt,
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
    status: record.status,
    source: record.source,
    importRowId: record.importRowId,
    transferPeerId: record.transferPeerId,
    deletedAt: record.deletedAt,
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
  return toTransaction(row, loadLines(db, id));
}

export function auditTransaction(
  tx: WriteTx,
  id: string,
  action: string,
  before: Transaction | null,
  after: Transaction | null,
): void {
  tx.audit({
    entity: "transactions",
    entityId: id,
    action,
    before: before ? snapshot(before) : null,
    after: after ? snapshot(after) : null,
  });
}
