import { accounts, categories, merchants, tags, transactions } from "@num/db";
import { autoReasons, utcNow, type AutoReason, type Transaction } from "@num/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { loadLines, replaceLines, type StoredLine } from "./transaction-lines";
import {
  auditTransaction,
  headerForWrite,
  headerFrom,
  readTransaction,
  recordSource,
  toTransaction,
  type Header,
  type TransactionBody,
  type TxRow,
} from "./transaction-record";
import { assertLineShape, isMirrorSide, normalizeLine, type NormalizedLine } from "./transaction-rules";
import { linkAutomatic } from "./auto-link";
import { recordRefundNo } from "./refund-auto";
import { linkLearnedTransfers, recordPairNo } from "./transfer-auto";
import { assertRefundLink, withRefundPurchase } from "./refund-link";
import { spreadSureLabels } from "./match-apply";
import { transactionReconciled } from "./reconciled";
import { removeTransaction } from "./transaction-erase";
import { applyMirrorEdit, applySourceEdit, attachTransfer } from "./transaction-transfer";
import { clearUnreadableLine } from "./unreadable-line";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

export type AutoStamp = { autoReason: AutoReason | null; autoSourceId: string | null; autoConfidence: number | null };

const clearedAuto: AutoStamp = { autoReason: null, autoSourceId: null, autoConfidence: null };

function keptAuto(row: TxRow): AutoStamp {
  if (row.autoReason && (autoReasons as readonly string[]).includes(row.autoReason)) {
    return {
      autoReason: row.autoReason as AutoReason,
      autoSourceId: row.autoSourceId,
      autoConfidence: row.autoConfidence,
    };
  }
  return clearedAuto;
}

function labelChanged(existing: TxRow, existingLines: StoredLine[], header: Header, lines: NormalizedLine[]): boolean {
  if ((existing.merchantId ?? null) !== (header.merchantId ?? null) || (existing.refundOfId ?? null) !== (header.refundOfId ?? null)) {
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
  if (txn.mirror || txn.lines.length !== 1) {
    return false;
  }
  const line = txn.lines[0];
  return line !== undefined && line.categoryId !== null && line.transferAccountId === null;
}

function requireActive(db: Db | WriteTx, id: string): TxRow {
  const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!row) {
    throw new ServiceError("transaction_not_found", 404);
  }
  return row;
}

function assertDeletable(db: Db | WriteTx, row: TxRow, peer: TxRow | null): void {
  if (transactionReconciled(db, row.accountId, row.date) || (peer !== null && transactionReconciled(db, peer.accountId, peer.date))) {
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
  db: Db | WriteTx,
  existing: TxRow,
  existingLines: StoredLine[],
  peer: TxRow | null,
  header: Header,
  lines: NormalizedLine[],
): void {
  const locked =
    transactionReconciled(db, existing.accountId, existing.date) ||
    (peer !== null && transactionReconciled(db, peer.accountId, peer.date));
  if (!locked) {
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
  const typed = input.lines.map(normalizeLine);
  const recordSourceName = recordSource(source);
  const id = crypto.randomUUID();
  const typedHeader = headerFor(input, typed);
  assertLineShape(typedHeader.accountId, typedHeader.amount, typed);
  assertRefundLink(tx, typedHeader, null);
  const { header, lines } = withRefundPurchase(tx, typedHeader, typed);
  assertReferences(tx, header, lines, { accountId: null, transferAccountId: null });
  tx.insert(transactions)
    .values({
      id,
      ...header,
      refundOfId: header.refundOfId ?? null,
      source: recordSourceName,
      importRowId: null,
      transferPeerId: null,
      mirror: false,
      autoReason: null,
      autoSourceId: null,
      autoConfidence: null,
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
    spreadSureLabels(tx, [created.payeeNormalized], new Set([created.id]));
  }
  return created;
}

export function createTransaction(db: Db, input: TransactionBody & WriteInput): Transaction {
  const at = input.at ?? utcNow();
  let created: Transaction | undefined;
  write(db, { source: input.source, at }, (tx) => {
    created = insertTransaction(tx, input, input.source);
    if (input.unreadableItemKey) {
      clearUnreadableLine(tx, input.unreadableItemKey);
    }
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
  spread = true,
): Transaction {
  const lines = input.lines.map(normalizeLine);
  const header = headerFor(input, lines);
  const existing = requireActive(tx, id);
  const existingLines = loadLines(tx, id);
  const peer = existing.transferPeerId ? requireActive(tx, existing.transferPeerId) : null;
  const peerLines = peer ? loadLines(tx, peer.id) : [];
  assertReconciledMoney(tx, existing, existingLines, peer, header, lines);
  assertPayee(existing, header.payeeRaw);
  assertLineShape(header.accountId, header.amount, lines);
  const previousTarget = existingLines.find((line) => line.transferAccountId !== null)?.transferAccountId ?? null;
  assertReferences(tx, header, lines, { accountId: existing.accountId, transferAccountId: previousTarget });
  const savedHeader = headerForWrite(existing.refundOfId, header);
  assertRefundLink(tx, savedHeader, id);
  const linked = withRefundPurchase(tx, savedHeader, lines);
  const changed = labelChanged(existing, existingLines, linked.header, linked.lines);
  const auto: AutoStamp = changed || isTransferOrSplit(lines) ? clearedAuto : keptAuto(existing);
  if (peer && isMirrorSide(existingLines, peer.accountId, peerLines.length)) {
    applyMirrorEdit(tx, existing, existingLines, peer, peerLines, linked.header, linked.lines, at, auto);
  } else {
    applySourceEdit(tx, existing, existingLines, peer, peerLines, linked.header, linked.lines, at, auto);
  }
  const saved = readTransaction(tx, id);
  if (existing.refundOfId !== null && linked.header.refundOfId == null) {
    recordRefundNo(tx, id, at);
  }
  if (peer && !peer.mirror && saved.transferPeerId === null) {
    recordPairNo(tx, id, peer.id, at);
  }
  if (saved.transferPeerId !== null && !saved.mirror && saved.autoReason === null && saved.lines.some((line) => line.transferAccountId !== null)) {
    linkLearnedTransfers(tx, [id]);
  }
  if (spread && changed && isUserConfirmation(saved)) {
    spreadSureLabels(tx, [saved.payeeNormalized], new Set([saved.id]));
  }
  return saved;
}

/** "Looks right" on one row of an automatic pair confirms the other row too. */
function confirmLinkedPeer(tx: WriteTx, row: TxRow, at: string): void {
  if (row.autoReason !== "transfer_match" || !row.transferPeerId) {
    return;
  }
  const peer = requireActive(tx, row.transferPeerId);
  if (peer.autoReason !== "transfer_match") {
    return;
  }
  const before = readTransaction(tx, peer.id);
  tx.update(transactions).set({ ...clearedAuto, editedAt: at }).where(eq(transactions.id, peer.id)).run();
  auditTransaction(tx, peer.id, "update", before, readTransaction(tx, peer.id));
}

export function acceptLooksRight(db: Db, id: string, input: WriteInput): Transaction {
  const at = input.at ?? utcNow();
  let accepted: Transaction | undefined;
  write(db, { source: input.source, at }, (tx) => {
    const existing = requireActive(tx, id);
    if (existing.autoReason === null) {
      throw new ServiceError("invalid_body", 400);
    }
    const before = readTransaction(tx, id);
    tx.update(transactions).set({ ...clearedAuto, editedAt: at }).where(eq(transactions.id, id)).run();
    confirmLinkedPeer(tx, existing, at);
    const saved = readTransaction(tx, id);
    auditTransaction(tx, id, "update", before, saved);
    if (isUserConfirmation(saved)) {
      spreadSureLabels(tx, [saved.payeeNormalized], new Set([saved.id]));
    }
    linkAutomatic(tx, id);
    accepted = readTransaction(tx, id);
  });
  if (!accepted) {
    throw new Error("Confirm did not return a transaction");
  }
  return accepted;
}

export function spreadAfterConfirmations(tx: WriteTx, ids: readonly string[], alsoExcept: ReadonlySet<string> = new Set()): void {
  const except = new Set<string>(alsoExcept);
  const payees: string[] = [];
  for (const id of ids) {
    except.add(id);
    const saved = readTransaction(tx, id);
    if (saved.autoReason === null && isUserConfirmation(saved)) {
      payees.push(saved.payeeNormalized);
    }
  }
  spreadSureLabels(tx, payees, except);
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
    const peer = existing.transferPeerId ? requireActive(tx, existing.transferPeerId) : null;
    assertDeletable(tx, existing, peer);
    deleted = removeTransaction(tx, id);
  });
  if (!deleted) {
    throw new Error("Delete did not return a transaction");
  }
  return deleted;
}
