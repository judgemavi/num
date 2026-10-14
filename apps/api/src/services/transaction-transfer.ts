import { transactionLines, transactions, type TransactionRow } from "@num/db";
import { chooseTransferMatch, utcNow, type TransactionSource } from "@num/shared";
import { and, eq, isNull, ne } from "drizzle-orm";
import { ServiceError } from "../service-error";
import { dateIsReconciled, latestCheckpointDate } from "./reconciled";
import { eraseTransaction } from "./transaction-erase";
import { loadLines, replaceLines, type StoredLine } from "./transaction-lines";
import { auditTransaction, automaticPair, headerForWrite, readTransaction, toTransaction, type AutoStamp, type Header } from "./transaction-record";
import { transferLine, type NormalizedLine } from "./transaction-rules";
import { lineCount } from "./transaction-sql";
import type { WriteTx } from "./write";

export function insertMirror(
  tx: WriteTx,
  sourceId: string,
  header: Header,
  source: TransactionSource,
  targetAccountId: string,
  line: NormalizedLine,
  markEdited: boolean,
): void {
  const matchId = findTransferMatch(tx, {
    sourceId,
    targetAccountId,
    date: header.date,
    lineAmount: line.amount,
  });
  if (matchId) {
    linkMatch(tx, sourceId, header.accountId, matchId, markEdited);
    return;
  }
  const id = crypto.randomUUID();
  const amount = -line.amount;
  tx.insert(transactions)
    .values({
      id,
      accountId: targetAccountId,
      date: header.date,
      amount,
      merchantId: header.merchantId,
      payeeRaw: header.payeeRaw,
      payeeNormalized: header.payeeNormalized,
      status: "open",
      source,
      importRowId: null,
      transferPeerId: sourceId,
      mirror: true,
    })
    .run();
  replaceLines(tx, id, [
    {
      amount,
      memo: null,
      categoryId: null,
      transferAccountId: header.accountId,
      tagIds: line.tagIds,
    },
  ]);
  tx.update(transactions).set({ transferPeerId: id }).where(eq(transactions.id, sourceId)).run();
  auditTransaction(tx, id, "create", null, readTransaction(tx, id));
}

function linkMatch(tx: WriteTx, sourceId: string, sourceAccountId: string, matchId: string, markEdited: boolean): void {
  const match = tx.select().from(transactions).where(eq(transactions.id, matchId)).get();
  if (!match || match.transferPeerId) {
    throw new Error("Transfer match is missing");
  }
  const matchLines = loadLines(tx, matchId);
  const before = toTransaction(tx, match, matchLines);
  const line = matchLines[0];
  tx.update(transactions).set({ transferPeerId: matchId }).where(eq(transactions.id, sourceId)).run();
  tx.update(transactions)
    .set({
      transferPeerId: sourceId,
      autoReason: null,
      autoSourceId: null,
      autoConfidence: null,
      ...(markEdited ? { editedAt: utcNow() } : {}),
    })
    .where(eq(transactions.id, matchId))
    .run();
  replaceLines(tx, matchId, [
    {
      amount: match.amount,
      memo: line?.memo ?? null,
      categoryId: null,
      transferAccountId: sourceAccountId,
      tagIds: line?.tagIds ?? [],
    },
  ]);
  auditTransaction(tx, matchId, "update", before, readTransaction(tx, matchId));
}

function findTransferMatch(tx: WriteTx, input: { sourceId: string; targetAccountId: string; date: string; lineAmount: number }) {
  const rows = tx
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      lineCount: lineCount(transactions.id),
    })
    .from(transactions)
    .where(
      and(
        isNull(transactions.transferPeerId),
        ne(transactions.id, input.sourceId),
        eq(transactions.accountId, input.targetAccountId),
        eq(transactions.amount, -input.lineAmount),
      ),
    )
    .all();
  const checkpoint = latestCheckpointDate(tx, input.targetAccountId);
  return chooseTransferMatch(
    rows.map((row) => ({ ...row, reconciled: dateIsReconciled(row.date, checkpoint) })),
    { date: input.date, lineAmount: input.lineAmount },
  );
}

export function attachTransfer(
  tx: WriteTx,
  sourceId: string,
  header: Header,
  source: TransactionSource,
  line: NormalizedLine,
  markEdited = true,
): void {
  const target = line.transferAccountId;
  if (!target) {
    throw new Error("Transfer line is missing");
  }
  const matchId = findTransferMatch(tx, {
    sourceId,
    targetAccountId: target,
    date: header.date,
    lineAmount: line.amount,
  });
  if (matchId) {
    linkMatch(tx, sourceId, header.accountId, matchId, markEdited);
    return;
  }
  insertMirror(tx, sourceId, header, source, target, line, markEdited);
}

function releasePeer(tx: WriteTx, sourceId: string, peer: TransactionRow, peerLines: StoredLine[], at: string): void {
  const before = toTransaction(tx, peer, peerLines);
  tx.update(transactions).set({ transferPeerId: null }).where(eq(transactions.id, sourceId)).run();
  if (peer.mirror) {
    eraseTransaction(tx, peer.id);
    auditTransaction(tx, peer.id, "delete", before, null);
    return;
  }
  tx.update(transactions)
    .set({ transferPeerId: null, autoReason: null, autoSourceId: null, autoConfidence: null, ...(automaticPair(peer) ? {} : { editedAt: at }) })
    .where(eq(transactions.id, peer.id))
    .run();
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
  auditTransaction(tx, peer.id, "update", before, readTransaction(tx, peer.id));
}

function rewriteMirror(
  tx: WriteTx,
  source: TransactionRow,
  peer: TransactionRow,
  peerLines: StoredLine[],
  header: Header,
  line: NormalizedLine,
): void {
  const before = toTransaction(tx, peer, peerLines);
  const back = peerLines.find((item) => item.transferAccountId === source.accountId);
  const amount = -line.amount;
  const target = line.transferAccountId;
  if (!target) {
    throw new Error("Transfer line is missing");
  }
  tx.update(transactions)
    .set({ accountId: target, date: header.date, amount, autoReason: null, autoSourceId: null, autoConfidence: null })
    .where(eq(transactions.id, peer.id))
    .run();
  replaceLines(tx, peer.id, [
    {
      amount,
      memo: back?.memo ?? null,
      categoryId: null,
      transferAccountId: header.accountId,
      tagIds: back?.tagIds ?? [],
    },
  ]);
  auditTransaction(tx, peer.id, "update", before, readTransaction(tx, peer.id));
}

export function applyMirrorEdit(
  tx: WriteTx,
  existing: TransactionRow,
  existingLines: StoredLine[],
  peer: TransactionRow,
  peerLines: StoredLine[],
  header: Header,
  lines: NormalizedLine[],
  at: string,
  auto: AutoStamp,
): void {
  const line = lines[0];
  if (lines.length !== 1 || !line || line.transferAccountId !== peer.accountId) {
    throw new ServiceError("mirror_one_line", 400);
  }
  if (header.amount !== existing.amount) {
    throw new ServiceError("mirror_amount_locked", 409);
  }
  const sourceLine = peerLines.find((item) => item.transferAccountId === existing.accountId);
  if (!sourceLine) {
    throw new Error("Transfer line is missing");
  }
  const before = toTransaction(tx, existing, existingLines);
  const peerBefore = toTransaction(tx, peer, peerLines);
  const moneyChanged = header.date !== existing.date || header.accountId !== existing.accountId;
  tx.update(transactions)
    .set({ ...headerForWrite(existing.refundOfId, header), ...auto, editedAt: at })
    .where(eq(transactions.id, existing.id))
    .run();
  replaceLines(tx, existing.id, lines);
  if (peer.mirror) {
    tx.update(transactions).set({ date: header.date }).where(eq(transactions.id, peer.id)).run();
    tx.update(transactionLines)
      .set({ transferAccountId: header.accountId })
      .where(eq(transactionLines.id, sourceLine.id))
      .run();
    auditTransaction(tx, peer.id, "update", peerBefore, readTransaction(tx, peer.id));
  } else if (moneyChanged) {
    releasePeer(tx, existing.id, peer, peerLines, at);
  }
  auditTransaction(tx, existing.id, "update", before, readTransaction(tx, existing.id));
}

export function applySourceEdit(
  tx: WriteTx,
  existing: TransactionRow,
  existingLines: StoredLine[],
  peer: TransactionRow | null,
  peerLines: StoredLine[],
  header: Header,
  lines: NormalizedLine[],
  at: string,
  auto: AutoStamp,
): void {
  const before = toTransaction(tx, existing, existingLines);
  tx.update(transactions)
    .set({ ...headerForWrite(existing.refundOfId, header), ...auto, editedAt: at })
    .where(eq(transactions.id, existing.id))
    .run();
  replaceLines(tx, existing.id, lines);
  const line = transferLine(lines);
  if (!line?.transferAccountId) {
    if (peer) {
      releasePeer(tx, existing.id, peer, peerLines, at);
    }
    auditTransaction(tx, existing.id, "update", before, readTransaction(tx, existing.id));
    return;
  }
  const previousTarget = existingLines.find((item) => item.transferAccountId)?.transferAccountId ?? null;
  const moneyChanged =
    header.date !== existing.date ||
    header.amount !== existing.amount ||
    header.accountId !== existing.accountId ||
    line.transferAccountId !== previousTarget;
  if (peer?.mirror) {
    rewriteMirror(tx, existing, peer, peerLines, header, line);
  } else if (peer && moneyChanged) {
    releasePeer(tx, existing.id, peer, peerLines, at);
    attachTransfer(tx, existing.id, header, existing.source, line);
  } else if (!peer) {
    attachTransfer(tx, existing.id, header, existing.source, line);
  }
  auditTransaction(tx, existing.id, "update", before, readTransaction(tx, existing.id));
}
