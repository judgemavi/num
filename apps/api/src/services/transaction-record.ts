import { accounts, transactions, type TransactionRow } from "@num/db";
import {
  refundOfIdAfterEdit,
  storedPayee,
  type Transaction,
  type TransactionCreate,
  type TransactionSource,
} from "@num/shared";
import { eq } from "drizzle-orm";
import { loadLines, type StoredLine } from "./transaction-lines";
import { transactionReconciled } from "./reconciled";
import { requireText } from "./transaction-rules";
import type { WriteTx, Reader } from "./write";

export type Header = {
  accountId: string;
  date: string;
  amount: number;
  merchantId: string | null;
  payeeRaw: string;
  payeeNormalized: string;
  refundOfId?: string | null;
};

/** The automatic label of a transaction. */
export type AutoStamp = Pick<TransactionRow, "autoReason" | "autoSourceId" | "autoConfidence">;

/**
 * The status of a new manual, MCP or mirror transaction (decision 0052): `open` when its account gets imports
 * (it has an import preset or a column map), else `cleared`. An imported transaction is always `cleared`.
 */
export function newTransactionStatus(db: Reader, accountId: string) {
  const account = db
    .select({ importPreset: accounts.importPreset, columnMap: accounts.columnMap })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .get();
  return account && (account.importPreset !== null || account.columnMap !== null) ? "open" : "cleared";
}

export function recordSource(source: "ui" | TransactionSource): TransactionSource {
  if (source === "ui") {
    return "manual";
  }
  return source;
}

export function headerFrom(input: TransactionCreate): Header {
  return {
    accountId: input.accountId,
    date: input.date,
    amount: input.amount,
    merchantId: input.merchantId ?? null,
    ...storedPayee(requireText(input.payeeRaw, "payeeRaw")),
    ...(input.refundOfId === undefined ? {} : { refundOfId: input.refundOfId }),
  };
}

export function headerForWrite(existingRefundOfId: string | null, header: Header): Header {
  return {
    ...header,
    refundOfId: refundOfIdAfterEdit(existingRefundOfId, header.refundOfId),
  };
}

function refundFacts(db: Reader, row: TransactionRow): {
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

export function toTransaction(db: Reader, row: TransactionRow, lines: StoredLine[]): Transaction {
  return {
    id: row.id,
    accountId: row.accountId,
    date: row.date,
    amount: row.amount,
    merchantId: row.merchantId,
    payeeRaw: row.payeeRaw,
    payeeNormalized: row.payeeNormalized,
    status: row.status,
    reconciled: transactionReconciled(db, row.accountId, row.date),
    source: row.source,
    importRowId: row.importRowId,
    transferPeerId: row.transferPeerId,
    mirror: row.mirror,
    autoReason: row.autoReason,
    autoSourceId: row.autoSourceId,
    autoConfidence: row.autoConfidence,
    refundOfId: row.refundOfId,
    ...refundFacts(db, row),
    lines,
  };
}

/** The audit log keeps the stored fields. It leaves out the id and the fields that the read adds. */
function snapshot({ id, refundOf, refundedAmount, ...stored }: Transaction) {
  return stored;
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
export function automaticPair(peer: TransactionRow): boolean {
  return peer.autoReason === "transfer_match" && peer.editedAt === null;
}
