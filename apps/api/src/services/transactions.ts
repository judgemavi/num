import { accounts, categories, merchants, tags, transactions } from "@num/db";
import { utcNow, type Transaction } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { loadLines, replaceLines, type StoredLine } from "./transaction-lines";
import {
  auditTransaction,
  headerFrom,
  readTransaction,
  recordSource,
  toTransaction,
  type Header,
  type TransactionBody,
  type TxRow,
} from "./transaction-record";
import { assertLineShape, isMirrorSide, normalizeLine, type NormalizedLine } from "./transaction-rules";
import { spreadSureLabels } from "./auto-label";
import { applyMirrorEdit, applySourceEdit, attachTransfer } from "./transaction-transfer";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

export type AutoStamp = { autoReason: "rule" | "learned" | null; autoSourceId: string | null };

const clearedAuto: AutoStamp = { autoReason: null, autoSourceId: null };

function keptAuto(row: TxRow): AutoStamp {
  if (row.autoReason === "rule" || row.autoReason === "learned") {
    return { autoReason: row.autoReason, autoSourceId: row.autoSourceId };
  }
  return clearedAuto;
}

function labelChanged(existing: TxRow, existingLines: StoredLine[], header: Header, lines: NormalizedLine[]): boolean {
  if ((existing.merchantId ?? null) !== (header.merchantId ?? null)) {
    return true;
  }
  const before = existingLines.map((line) => line.categoryId).sort();
  const after = lines.map((line) => line.categoryId ?? null).sort();
  return before.length !== after.length || before.some((value, index) => value !== after[index]);
}

function isTransferOrSplit(lines: NormalizedLine[]): boolean {
  return lines.length !== 1 || lines.some((line) => line.transferAccountId !== null);
}

function isUserConfirmation(txn: Transaction): boolean {
  if (txn.mirror || txn.deletedAt !== null || txn.lines.length !== 1) {
    return false;
  }
  const line = txn.lines[0];
  return line !== undefined && line.categoryId !== null && line.transferAccountId === null;
}

function requireActive(db: Db | WriteTx, id: string): TxRow {
  const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!row || row.deletedAt !== null) {
    throw new ServiceError("transaction_not_found", 404);
  }
  return row;
}

function assertDeletable(row: { status: string }, peer: { status: string } | null): void {
  if (row.status === "reconciled" || peer?.status === "reconciled") {
    throw new ServiceError("transaction_reconciled", 409);
  }
}

function moneySame(existing: TxRow, existingLines: StoredLine[], header: Header, lines: NormalizedLine[]): boolean {
  if (header.date !== existing.date || header.accountId !== existing.accountId || header.amount !== existing.amount) {
    return false;
  }
  if (lines.length !== existingLines.length) {
    return false;
  }
  const key = (amount: number, transferAccountId: string | null) => `${amount}\0${transferAccountId ?? ""}`;
  const next = lines.map((line) => key(line.amount, line.transferAccountId)).sort();
  const current = existingLines.map((line) => key(line.amount, line.transferAccountId)).sort();
  return next.every((value, index) => value === current[index]);
}

function assertReconciledMoney(
  existing: TxRow,
  existingLines: StoredLine[],
  peer: TxRow | null,
  header: Header,
  lines: NormalizedLine[],
): void {
  if (existing.status !== "reconciled" && peer?.status !== "reconciled") {
    return;
  }
  if (!moneySame(existing, existingLines, header, lines)) {
    throw new ServiceError("transaction_reconciled", 409);
  }
}

function assertPayee(existing: { source: string; payeeRaw: string }, payeeRaw: string): void {
  if (existing.source === "import" && existing.payeeRaw !== payeeRaw) {
    throw new ServiceError("payee_raw_locked", 409);
  }
}

function assertAccount(tx: WriteTx, id: string, previousId: string | null): void {
  const row = tx.select({ archivedAt: accounts.archivedAt }).from(accounts).where(eq(accounts.id, id)).get();
  if (!row) {
    throw new ServiceError("account_not_found", 404);
  }
  if (row.archivedAt !== null && id !== previousId) {
    throw new ServiceError("account_archived", 409);
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

function assertReferences(
  tx: WriteTx,
  header: Header,
  lines: NormalizedLine[],
  previous: { accountId: string | null; transferAccountId: string | null },
): void {
  assertAccount(tx, header.accountId, previous.accountId);
  assertMerchant(tx, header.merchantId);
  for (const line of lines) {
    if (line.transferAccountId) {
      assertAccount(tx, line.transferAccountId, previous.transferAccountId);
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
  return toTransaction(db, row, loadLines(db, id));
}

function headerFor(input: TransactionBody, lines: ReturnType<typeof normalizeLine>[]): Header {
  const header = headerFrom(input);
  if (lines.some((line) => line.transferAccountId !== null)) {
    return { ...header, merchantId: null };
  }
  return header;
}

export function insertTransaction(tx: WriteTx, input: TransactionBody, source: AuditSource, spread = true): Transaction {
  const lines = input.lines.map(normalizeLine);
  const header = headerFor(input, lines);
  const recordSourceName = recordSource(source);
  const id = crypto.randomUUID();
  assertLineShape(header.accountId, header.amount, lines);
  assertReferences(tx, header, lines, { accountId: null, transferAccountId: null });
  tx.insert(transactions)
    .values({
      id,
      ...header,
      source: recordSourceName,
      importRowId: null,
      transferPeerId: null,
      mirror: false,
      autoReason: null,
      autoSourceId: null,
      deletedAt: null,
    })
    .run();
  replaceLines(tx, id, lines);
  const line = lines.find((item) => item.transferAccountId !== null);
  if (line?.transferAccountId) {
    attachTransfer(tx, id, header, recordSourceName, line);
  }
  const created = readTransaction(tx, id);
  auditTransaction(tx, id, "create", null, created);
  if (spread && isUserConfirmation(created)) {
    spreadSureLabels(tx, created.payeeNormalized, new Set([created.id]));
  }
  return created;
}

export function createTransaction(db: Db, input: TransactionBody & WriteInput): Transaction {
  const at = input.at ?? utcNow();
  let created: Transaction | undefined;
  write(db, { source: input.source, at }, (tx) => {
    created = insertTransaction(tx, input, input.source);
  });
  if (!created) {
    throw new Error("Create did not return a transaction");
  }
  return created;
}

export function applyTransactionUpdate(
  tx: WriteTx,
  id: string,
  input: TransactionBody,
  at: string,
  automatic?: { reason: "rule"; sourceId: string },
  spread = true,
): Transaction {
  const lines = input.lines.map(normalizeLine);
  const header = headerFor(input, lines);
  const existing = requireActive(tx, id);
  const existingLines = loadLines(tx, id);
  const peer = existing.transferPeerId ? requireActive(tx, existing.transferPeerId) : null;
  const peerLines = peer ? loadLines(tx, peer.id) : [];
  assertReconciledMoney(existing, existingLines, peer, header, lines);
  assertPayee(existing, header.payeeRaw);
  assertLineShape(header.accountId, header.amount, lines);
  const previousTarget = existingLines.find((line) => line.transferAccountId !== null)?.transferAccountId ?? null;
  assertReferences(tx, header, lines, { accountId: existing.accountId, transferAccountId: previousTarget });
  const savedHeader = existing.status === "reconciled" ? { ...header, status: "reconciled" as const } : header;
  const changed = labelChanged(existing, existingLines, savedHeader, lines);
  const auto: AutoStamp = automatic
    ? { autoReason: automatic.reason, autoSourceId: automatic.sourceId }
    : changed || isTransferOrSplit(lines)
      ? clearedAuto
      : keptAuto(existing);
  if (peer && isMirrorSide(existingLines, peer.accountId, peerLines.length)) {
    applyMirrorEdit(tx, existing, existingLines, peer, peerLines, savedHeader, lines, at, auto);
  } else {
    applySourceEdit(tx, existing, existingLines, peer, peerLines, savedHeader, lines, at, auto);
  }
  const saved = readTransaction(tx, id);
  if (spread && !automatic && changed && isUserConfirmation(saved)) {
    spreadSureLabels(tx, saved.payeeNormalized, new Set([saved.id]));
  }
  return saved;
}

export function acceptLooksRight(db: Db, id: string, input: WriteInput): Transaction {
  const at = input.at ?? utcNow();
  let accepted: Transaction | undefined;
  write(db, { source: input.source, at }, (tx) => {
    const existing = requireActive(tx, id);
    if (existing.autoReason !== "rule" && existing.autoReason !== "learned") {
      throw new ServiceError("invalid_body", 400);
    }
    const before = readTransaction(tx, id);
    tx.update(transactions).set(clearedAuto).where(eq(transactions.id, id)).run();
    const saved = readTransaction(tx, id);
    auditTransaction(tx, id, "update", before, saved);
    if (isUserConfirmation(saved)) {
      spreadSureLabels(tx, saved.payeeNormalized, new Set([saved.id]));
    }
    accepted = saved;
  });
  if (!accepted) {
    throw new Error("Confirm did not return a transaction");
  }
  return accepted;
}

export function spreadAfterConfirmation(tx: WriteTx, id: string, alsoExcept: ReadonlySet<string> = new Set()): void {
  const saved = readTransaction(tx, id);
  if (saved.autoReason === null && isUserConfirmation(saved)) {
    spreadSureLabels(tx, saved.payeeNormalized, new Set([saved.id, ...alsoExcept]));
  }
}

export function updateTransaction(db: Db, id: string, input: TransactionBody & WriteInput): Transaction {
  const at = input.at ?? utcNow();
  let updated: Transaction | undefined;
  write(db, { source: input.source, at }, (tx) => {
    updated = applyTransactionUpdate(tx, id, input, at);
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
    assertDeletable(existing, peer);
    const before = toTransaction(tx, existing, existingLines);
    tx.update(transactions).set({ deletedAt: at }).where(eq(transactions.id, existing.id)).run();
    auditTransaction(tx, existing.id, "delete", before, readTransaction(tx, existing.id));
    if (peer?.mirror) {
      const peerBefore = toTransaction(tx, peer, peerLines);
      tx.update(transactions).set({ deletedAt: at }).where(eq(transactions.id, peer.id)).run();
      auditTransaction(tx, peer.id, "delete", peerBefore, readTransaction(tx, peer.id));
    } else if (peer) {
      const peerBefore = toTransaction(tx, peer, peerLines);
      tx.update(transactions).set({ transferPeerId: null }).where(eq(transactions.id, existing.id)).run();
      tx.update(transactions).set({ transferPeerId: null }).where(eq(transactions.id, peer.id)).run();
      replaceLines(
        tx,
        peer.id,
        peerLines.map((line) => ({
          amount: line.amount,
          memo: line.memo,
          categoryId: line.transferAccountId ? null : line.categoryId,
          transferAccountId: null,
          tagIds: line.tagIds,
        })),
      );
      auditTransaction(tx, peer.id, "update", peerBefore, readTransaction(tx, peer.id));
    }
    deleted = readTransaction(tx, existing.id);
  });
  if (!deleted) {
    throw new Error("Delete did not return a transaction");
  }
  return deleted;
}
