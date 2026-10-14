import { transactions, type TransactionRow } from "@num/db";
import { utcNow, type Transaction } from "@num/shared";
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
  type AutoStamp,
  type Header,
  type TransactionBody,
} from "./transaction-record";
import { assertLineShape, isMirrorSide, normalizeLine, type NormalizedLine } from "./transaction-rules";
import { linkAutomatic } from "./auto-link";
import { recordRefundNo } from "./refund-auto";
import { linkLearnedTransfers, recordPairNo } from "./transfer-auto";
import { assertRefundLink, withRefundPurchase } from "./refund-link";
import { spreadSureLabels } from "./match-apply";
import { transactionReconciled } from "./reconciled";
import { assertPayee, assertReconciledMoney, assertReferences } from "./transaction-checks";
import { removeTransaction } from "./transaction-erase";
import { applyMirrorEdit, applySourceEdit, attachTransfer } from "./transaction-transfer";
import { isUncategorized, recordKeep } from "./decision-keep";
import { clearUnreadableLine } from "./unreadable-line";
import { keepOmitted, write, type AuditSource, type WriteTx, type WriteInput, type Reader } from "./write";

const clearedAuto: AutoStamp = { autoReason: null, autoSourceId: null, autoConfidence: null };

function keptAuto({ autoReason, autoSourceId, autoConfidence }: TransactionRow): AutoStamp {
  return { autoReason, autoSourceId, autoConfidence };
}

function labelChanged(existing: TransactionRow, existingLines: StoredLine[], header: Header, lines: NormalizedLine[]) {
  if ((existing.merchantId ?? null) !== (header.merchantId ?? null) || (existing.refundOfId ?? null) !== (header.refundOfId ?? null)) {
    return true;
  }
  const before = existingLines.map((line) => line.categoryId).sort();
  const after = lines.map((line) => line.categoryId ?? null).sort();
  return before.length !== after.length || before.some((value, index) => value !== after[index]);
}

function isTransferOrSplit(lines: NormalizedLine[]) {
  return lines.length !== 1 || lines.some((line) => line.transferAccountId !== null);
}

function isUserConfirmation(txn: Transaction) {
  if (txn.mirror || txn.lines.length !== 1) {
    return false;
  }
  const line = txn.lines[0];
  return line !== undefined && line.categoryId !== null && line.transferAccountId === null;
}

function requireActive(db: Reader, id: string): TransactionRow {
  const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!row) {
    throw new ServiceError("transaction_not_found", 404);
  }
  return row;
}

function assertDeletable(db: Reader, row: TransactionRow, peer: TransactionRow | null): void {
  if (transactionReconciled(db, row.accountId, row.date) || (peer !== null && transactionReconciled(db, peer.accountId, peer.date))) {
    throw new ServiceError("transaction_reconciled", 409);
  }
}

export function getTransaction(db: Db, id: string): Transaction | null {
  const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!row) {
    return null;
  }
  return toTransaction(db, row, loadLines(db, id));
}

function headerFor(input: TransactionBody, lines: ReturnType<typeof normalizeLine>[]) {
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
  return write(db, { source: input.source, at }, (tx) => {
    const created = insertTransaction(tx, input, input.source);
    linkLearnedTransfers(tx, [created.id], new Set([created.id]));
    if (input.unreadableItemKey) {
      clearUnreadableLine(tx, input.unreadableItemKey);
    }
    return created;
  });
}

/** A merchant or a note that the update leaves out keeps its stored value. An explicit null clears it. */
export function applyTransactionUpdate(
  tx: WriteTx,
  id: string,
  input: TransactionBody,
  at: string,
  spread = true,
): Transaction {
  const lines = input.lines.map(normalizeLine);
  const existing = requireActive(tx, id);
  const header = headerFor(
    {
      ...input,
      merchantId: keepOmitted(input.merchantId, existing.merchantId),
      notes: keepOmitted(input.notes, existing.notes),
    },
    lines,
  );
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
  if (spread && changed && isUserConfirmation(saved)) {
    spreadSureLabels(tx, [saved.payeeNormalized], new Set([saved.id]));
  }
  return saved;
}

/** "Looks right" on one row of an automatic pair confirms the other row too. */
export function confirmLinkedPeer(tx: WriteTx, row: TransactionRow, at: string): string | null {
  if (row.autoReason !== "transfer_match" || !row.transferPeerId) {
    return null;
  }
  const peer = requireActive(tx, row.transferPeerId);
  if (peer.autoReason !== "transfer_match") {
    return null;
  }
  const before = readTransaction(tx, peer.id);
  tx.update(transactions).set({ ...clearedAuto, editedAt: at }).where(eq(transactions.id, peer.id)).run();
  auditTransaction(tx, peer.id, "update", before, readTransaction(tx, peer.id));
  return peer.id;
}

export function acceptLooksRight(db: Db, id: string, input: WriteInput): Transaction {
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
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
    linkLearnedTransfers(tx, [id], new Set([id, ...(existing.transferPeerId ? [existing.transferPeerId] : [])]));
    return readTransaction(tx, id);
  });
}

/**
 * Runs once after a batch of confirmations. `batch` holds every id of the batch (targets and excluded rows):
 * the learned-transfer link leaves them alone.
 */
export function spreadAfterConfirmations(
  tx: WriteTx,
  ids: readonly string[],
  alsoExcept: ReadonlySet<string> = new Set(),
  batch: ReadonlySet<string> = new Set(),
): void {
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
  linkLearnedTransfers(tx, ids, new Set([...batch, ...ids, ...alsoExcept]));
}

export function updateTransaction(
  db: Db,
  id: string,
  input: TransactionBody & WriteInput & { keepUncategorized?: boolean },
): Transaction {
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
    const before = readTransaction(tx, id);
    const wasTransfer = before.lines.some((line) => line.transferAccountId !== null);
    const updated = applyTransactionUpdate(tx, id, input, at);
    if (!wasTransfer || (before.autoReason !== null && updated.autoReason === null)) {
      linkLearnedTransfers(tx, [id], new Set([id]));
    }
    if (input.keepUncategorized && isUncategorized(tx, id)) {
      recordKeep(tx, id, at);
    }
    return updated;
  });
}

export function deleteTransaction(db: Db, id: string, input: WriteInput): Transaction {
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
    const existing = requireActive(tx, id);
    const peer = existing.transferPeerId ? requireActive(tx, existing.transferPeerId) : null;
    assertDeletable(tx, existing, peer);
    return removeTransaction(tx, id, at);
  });
}
