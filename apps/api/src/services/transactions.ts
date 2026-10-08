import { accounts, categories, merchants, tags, transactions } from "@num/db";
import { utcNow, type Transaction, type TransactionCreate, type TransactionUpdate } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { loadLines, replaceLines } from "./transaction-lines";
import {
  auditTransaction,
  headerFrom,
  readTransaction,
  recordSource,
  toTransaction,
  type Header,
  type TxRow,
} from "./transaction-record";
import { assertLineShape, isMirrorSide, normalizeLine, type NormalizedLine } from "./transaction-rules";
import { applyMirrorEdit, applySourceEdit, insertMirror } from "./transaction-transfer";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

function requireActive(db: Db | WriteTx, id: string): TxRow {
  const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!row || row.deletedAt !== null) {
    throw new ServiceError("transaction_not_found", 404);
  }
  return row;
}

function assertMutable(row: { status: string }, peer: { status: string } | null): void {
  if (row.status === "reconciled" || peer?.status === "reconciled") {
    throw new ServiceError("transaction_reconciled", 409);
  }
}

function assertPayee(existing: { source: string; payeeRaw: string }, payeeRaw: string): void {
  if (existing.source === "import" && existing.payeeRaw !== payeeRaw) {
    throw new ServiceError("payee_raw_locked", 409);
  }
}

function assertAccount(tx: WriteTx, id: string): void {
  const row = tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, id)).get();
  if (!row) {
    throw new ServiceError("account_not_found", 404);
  }
}

function assertCategory(tx: WriteTx, id: string): void {
  const row = tx.select({ archivedAt: categories.archivedAt }).from(categories).where(eq(categories.id, id)).get();
  if (!row) {
    throw new ServiceError("category_not_found", 404);
  }
  if (row.archivedAt) {
    throw new ServiceError("category_archived", 409);
  }
}

function assertTag(tx: WriteTx, id: string): void {
  const row = tx.select({ archivedAt: tags.archivedAt }).from(tags).where(eq(tags.id, id)).get();
  if (!row) {
    throw new ServiceError("tag_not_found", 404);
  }
  if (row.archivedAt) {
    throw new ServiceError("tag_archived", 409);
  }
}

function assertMerchant(tx: WriteTx, id: string | null): void {
  if (id === null) {
    return;
  }
  const row = tx.select({ archivedAt: merchants.archivedAt }).from(merchants).where(eq(merchants.id, id)).get();
  if (!row) {
    throw new ServiceError("merchant_not_found", 404);
  }
  if (row.archivedAt) {
    throw new ServiceError("merchant_archived", 409);
  }
}

function assertReferences(tx: WriteTx, header: Header, lines: NormalizedLine[]): void {
  assertAccount(tx, header.accountId);
  assertMerchant(tx, header.merchantId);
  for (const line of lines) {
    if (line.transferAccountId) {
      assertAccount(tx, line.transferAccountId);
    }
    if (line.categoryId) {
      assertCategory(tx, line.categoryId);
    }
    for (const tagId of line.tagIds) {
      assertTag(tx, tagId);
    }
  }
}

export function getTransaction(db: Db, id: string): Transaction | null {
  const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!row) {
    return null;
  }
  return toTransaction(row, loadLines(db, id));
}

export function createTransaction(db: Db, input: TransactionCreate & WriteInput): Transaction {
  const header = headerFrom(input);
  const lines = input.lines.map(normalizeLine);
  const source = recordSource(input.source);
  const id = crypto.randomUUID();
  let created: Transaction | undefined;
  write(db, { source: input.source, at: input.at }, (tx) => {
    assertLineShape(header.accountId, header.amount, lines);
    assertReferences(tx, header, lines);
    tx.insert(transactions)
      .values({
        id,
        ...header,
        source,
        importRowId: null,
        transferPeerId: null,
        deletedAt: null,
      })
      .run();
    replaceLines(tx, id, lines);
    const line = lines.find((item) => item.transferAccountId !== null);
    if (line?.transferAccountId) {
      insertMirror(tx, id, header, source, line.transferAccountId, line);
    }
    auditTransaction(tx, id, "create", null, readTransaction(tx, id));
    created = readTransaction(tx, id);
  });
  if (!created) {
    throw new Error("Create did not return a transaction");
  }
  return created;
}

export function updateTransaction(db: Db, id: string, input: TransactionUpdate & WriteInput): Transaction {
  const at = input.at ?? utcNow();
  const header = headerFrom(input);
  const lines = input.lines.map(normalizeLine);
  let updated: Transaction | undefined;
  write(db, { source: input.source, at }, (tx) => {
    const existing = requireActive(tx, id);
    const existingLines = loadLines(tx, id);
    const peer = existing.transferPeerId ? requireActive(tx, existing.transferPeerId) : null;
    const peerLines = peer ? loadLines(tx, peer.id) : [];
    assertMutable(existing, peer);
    assertPayee(existing, header.payeeRaw);
    assertLineShape(header.accountId, header.amount, lines);
    assertReferences(tx, header, lines);
    if (peer && isMirrorSide(existingLines, peer.accountId, peerLines.length)) {
      applyMirrorEdit(tx, existing, existingLines, peer, peerLines, header, lines);
    } else {
      applySourceEdit(tx, existing, existingLines, peer, peerLines, header, lines, at);
    }
    updated = readTransaction(tx, id);
  });
  if (!updated) {
    throw new Error("Update did not return a transaction");
  }
  return updated;
}

export function deleteTransaction(db: Db, id: string, input: WriteInput): Transaction {
  const at = input.at ?? utcNow();
  let deleted: Transaction | undefined;
  write(db, { source: input.source, at }, (tx) => {
    const existing = requireActive(tx, id);
    const existingLines = loadLines(tx, id);
    const peer = existing.transferPeerId ? requireActive(tx, existing.transferPeerId) : null;
    const peerLines = peer ? loadLines(tx, peer.id) : [];
    assertMutable(existing, peer);
    const before = toTransaction(existing, existingLines);
    tx.update(transactions).set({ deletedAt: at }).where(eq(transactions.id, existing.id)).run();
    auditTransaction(tx, existing.id, "delete", before, readTransaction(tx, existing.id));
    if (peer) {
      const peerBefore = toTransaction(peer, peerLines);
      tx.update(transactions).set({ deletedAt: at }).where(eq(transactions.id, peer.id)).run();
      auditTransaction(tx, peer.id, "delete", peerBefore, readTransaction(tx, peer.id));
    }
    deleted = readTransaction(tx, existing.id);
  });
  if (!deleted) {
    throw new Error("Delete did not return a transaction");
  }
  return deleted;
}
