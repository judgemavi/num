import { transactions, type TransactionRow } from "@num/db";
import { transactionWriteSchema, utcNow, type Transaction, type TransactionCreate, type TransactionUpdate, type TransactionWrite } from "@num/shared";
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
} from "./transaction-record";
import { assertLineShape, isMirrorSide, normalizeLine, type NormalizedLine } from "./transaction-rules";
import { linkAutomatic } from "./auto-link";
import { recordRefundNo } from "./refund-auto";
import { linkLearnedTransfers, linkTransferPair, recordPairNo } from "./transfer-auto";
import { acceptedPeer, pairIsOpen, recordSaveAnswer } from "./transaction-answer";
import { assertRefundLink, withRefundPurchase } from "./refund-link";
import { spreadSureLabels } from "./match-apply";
import { transactionReconciled } from "./reconciled";
import { assertPayee, assertReconciledMoney, assertReferences } from "./transaction-checks";
import { removeTransaction } from "./transaction-erase";
import { applyMirrorEdit, applySourceEdit, attachTransfer } from "./transaction-transfer";
import { isUncategorized, recordKeep, teachesLabel } from "./decision-keep";
import { clearUnreadableLine } from "./unreadable-line";
import { mergedWrite } from "./patch";
import { keepOmitted, write, type AuditSource, type WriteTx, type WriteInput, type Reader } from "./write";
import { requireWholeAmounts } from "./book-step";

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

function headerFor(input: TransactionCreate, lines: ReturnType<typeof normalizeLine>[]) {
  const header = headerFrom(input);
  if (lines.some((line) => line.transferAccountId !== null)) {
    return { ...header, merchantId: null };
  }
  return header;
}

export function insertTransaction(tx: WriteTx, input: TransactionCreate, source: AuditSource, spread = true): Transaction {
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
      status: "open",
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
  if (spread && teachesLabel(tx, created)) {
    spreadSureLabels(tx, [created.payeeNormalized], new Set([created.id]));
  }
  return created;
}

export function createTransaction(db: Db, input: TransactionCreate & WriteInput): Transaction {
  requireWholeAmounts(db, [input.amount, ...input.lines.map((line) => line.amount)]);
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

/**
 * A merchant that the update leaves out keeps its stored value. An explicit null clears it.
 * `spread: false` leaves the spread of labels to the caller (a batch spreads once). `confirm: true` makes the update a
 * confirmation: it also clears an automatic label that stays (decision 0051).
 */
export function applyTransactionUpdate(
  tx: WriteTx,
  id: string,
  input: TransactionCreate,
  at: string,
  { spread = true, confirm = false }: { spread?: boolean; confirm?: boolean } = {},
): Transaction {
  const lines = input.lines.map(normalizeLine);
  const existing = requireActive(tx, id);
  const header = headerFor({ ...input, merchantId: keepOmitted(input.merchantId, existing.merchantId) }, lines);
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
  const auto: AutoStamp = confirm || changed || isTransferOrSplit(lines) ? clearedAuto : keptAuto(existing);
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
  if (spread && changed && teachesLabel(tx, saved)) {
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
    // An automatic "no category" becomes a kept row (decision 0046).
    if (isUncategorized(tx, id)) {
      recordKeep(tx, id, at);
    }
    if (teachesLabel(tx, saved)) {
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
    if (saved.autoReason === null && teachesLabel(tx, saved)) {
      payees.push(saved.payeeNormalized);
    }
  }
  spreadSureLabels(tx, payees, except);
  linkLearnedTransfers(tx, ids, new Set([...batch, ...ids, ...alsoExcept]));
}

/** The stored transaction as a write body. A PATCH merges its fields into it. */
function storedBody(txn: Transaction): TransactionWrite {
  return {
    accountId: txn.accountId,
    date: txn.date,
    amount: txn.amount,
    merchantId: txn.merchantId,
    payeeRaw: txn.payeeRaw,
    lines: txn.lines.map(({ amount, memo, categoryId, transferAccountId, tagIds }) => ({ amount, memo, categoryId, transferAccountId, tagIds })),
    refundOfId: txn.refundOfId,
  };
}

/**
 * The save accepts the proposed pair (decision 0047): the two transactions become the two sides of one transfer, as
 * "accept the pair" does. The other fields of the save then apply to the linked transaction.
 */
function acceptPairOnSave(tx: WriteTx, id: string, otherId: string, input: TransactionUpdate, at: string): Transaction {
  linkTransferPair(tx, id, otherId, at);
  const linked = storedBody(readTransaction(tx, id));
  const body = mergedWrite(transactionWriteSchema, linked, input);
  if (JSON.stringify(body) !== JSON.stringify(transactionWriteSchema.parse(linked))) {
    applyTransactionUpdate(tx, id, body, at);
  }
  linkLearnedTransfers(tx, [id, otherId], new Set([id, otherId]));
  return readTransaction(tx, id);
}

/**
 * A PATCH: a field that the patch leaves out keeps its stored value. `lines` replaces all the lines.
 * The checks that use more than one field (the lines and the amount, a transfer and a merchant) run on the result.
 * `answer` is the Needs review question that the editor showed: the saved fields answer it in the same write.
 */
export function updateTransaction(db: Db, id: string, input: TransactionUpdate & WriteInput): Transaction {
  // Only the amounts in the patch. A stored amount is not checked again (decision 0040).
  requireWholeAmounts(db, [input.amount, ...(input.lines ?? []).map((line) => line.amount)]);
  const at = input.at ?? utcNow();
  const { answer } = input;
  const pairOpen = answer?.question === "transfer_pair" && pairIsOpen(db, answer.asOf, id, answer.otherId);
  return write(db, { source: input.source, at }, (tx) => {
    const before = readTransaction(tx, id);
    const wasTransfer = before.lines.some((line) => line.transferAccountId !== null);
    const body = mergedWrite(transactionWriteSchema, storedBody(before), input);
    if (answer?.question === "transfer_pair" && acceptedPeer(tx, body, answer.otherId)) {
      if (!pairOpen) {
        throw new ServiceError("transfer_pair_not_found", 404);
      }
      return acceptPairOnSave(tx, id, answer.otherId, input, at);
    }
    const updated = applyTransactionUpdate(tx, id, body, at);
    if (!wasTransfer || (before.autoReason !== null && updated.autoReason === null)) {
      linkLearnedTransfers(tx, [id], new Set([id]));
    }
    if (input.keepUncategorized && isUncategorized(tx, id)) {
      recordKeep(tx, id, at);
      // A kept "no category" teaches (decision 0046). An automatic label teaches after "Looks right".
      if (updated.autoReason === null && teachesLabel(tx, updated)) {
        spreadSureLabels(tx, [updated.payeeNormalized], new Set([id]));
      }
    }
    if (answer) {
      recordSaveAnswer(tx, updated, answer, at);
      return readTransaction(tx, id);
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
