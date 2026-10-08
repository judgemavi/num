import { transactionLines, transactions } from "@num/db";
import { chooseTransferMatch } from "@num/shared";
import { eq, sql } from "drizzle-orm";
import { ServiceError } from "../service-error";
import { loadLines, replaceLines, type StoredLine } from "./transaction-lines";
import { auditTransaction, readTransaction, toTransaction, type Header, type TxRow } from "./transaction-record";
import { transferLine, type NormalizedLine } from "./transaction-rules";
import type { WriteTx } from "./write";

export function insertMirror(
  tx: WriteTx,
  sourceId: string,
  header: Header,
  source: string,
  targetAccountId: string,
  line: NormalizedLine,
): void {
  const id = crypto.randomUUID();
  const amount = -line.amount;
  tx.insert(transactions)
    .values({
      id,
      accountId: targetAccountId,
      date: header.date,
      amount,
      merchantId: header.merchantId,
      notes: header.notes,
      payeeRaw: header.payeeRaw,
      payeeNormalized: header.payeeNormalized,
      status: "open",
      source,
      importRowId: null,
      transferPeerId: sourceId,
      mirror: true,
      deletedAt: null,
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

function linkMatch(tx: WriteTx, sourceId: string, sourceAccountId: string, matchId: string): void {
  const match = tx.select().from(transactions).where(eq(transactions.id, matchId)).get();
  if (!match || match.deletedAt || match.transferPeerId) {
    throw new Error("Transfer match is missing");
  }
  const matchLines = loadLines(tx, matchId);
  const before = toTransaction(match, matchLines);
  const line = matchLines[0];
  tx.update(transactions).set({ transferPeerId: matchId }).where(eq(transactions.id, sourceId)).run();
  tx.update(transactions).set({ transferPeerId: sourceId }).where(eq(transactions.id, matchId)).run();
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

function findTransferMatch(tx: WriteTx, input: { sourceId: string; targetAccountId: string; date: string; lineAmount: number }): string | null {
  const rows = tx.all<{ id: string; date: string; amount: number; status: string; lineCount: number }>(sql`
    select
      t.id as id,
      t.date as date,
      t.amount as amount,
      t.status as status,
      (select count(*) from transaction_lines l where l.transaction_id = t.id) as lineCount
    from transactions t
    where t.deleted_at is null
      and t.transfer_peer_id is null
      and t.id <> ${input.sourceId}
      and t.account_id = ${input.targetAccountId}
      and t.amount = ${-input.lineAmount}
  `);
  return chooseTransferMatch(
    rows.map((row) => ({
      id: row.id,
      date: row.date,
      amount: row.amount,
      lineCount: Number(row.lineCount),
      reconciled: row.status === "reconciled",
    })),
    { date: input.date, lineAmount: input.lineAmount },
  );
}

export function attachTransfer(tx: WriteTx, sourceId: string, header: Header, source: string, line: NormalizedLine): void {
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
    linkMatch(tx, sourceId, header.accountId, matchId);
    return;
  }
  insertMirror(tx, sourceId, header, source, target, line);
}

function releasePeer(tx: WriteTx, sourceId: string, peer: TxRow, peerLines: StoredLine[], at: string): void {
  const before = toTransaction(peer, peerLines);
  tx.update(transactions).set({ transferPeerId: null }).where(eq(transactions.id, sourceId)).run();
  if (peer.mirror) {
    tx.update(transactions)
      .set({ transferPeerId: null, deletedAt: at })
      .where(eq(transactions.id, peer.id))
      .run();
    auditTransaction(tx, peer.id, "delete", before, readTransaction(tx, peer.id));
    return;
  }
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
  auditTransaction(tx, peer.id, "update", before, readTransaction(tx, peer.id));
}

function rewriteMirror(
  tx: WriteTx,
  source: TxRow,
  peer: TxRow,
  peerLines: StoredLine[],
  header: Header,
  line: NormalizedLine,
): void {
  const before = toTransaction(peer, peerLines);
  const back = peerLines.find((item) => item.transferAccountId === source.accountId);
  const amount = -line.amount;
  const target = line.transferAccountId;
  if (!target) {
    throw new Error("Transfer line is missing");
  }
  tx.update(transactions)
    .set({ accountId: target, date: header.date, amount })
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
  existing: TxRow,
  existingLines: StoredLine[],
  peer: TxRow,
  peerLines: StoredLine[],
  header: Header,
  lines: NormalizedLine[],
  at: string,
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
  const before = toTransaction(existing, existingLines);
  const peerBefore = toTransaction(peer, peerLines);
  const moneyChanged = header.date !== existing.date || header.accountId !== existing.accountId;
  tx.update(transactions).set(header).where(eq(transactions.id, existing.id)).run();
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
  existing: TxRow,
  existingLines: StoredLine[],
  peer: TxRow | null,
  peerLines: StoredLine[],
  header: Header,
  lines: NormalizedLine[],
  at: string,
): void {
  const before = toTransaction(existing, existingLines);
  tx.update(transactions).set(header).where(eq(transactions.id, existing.id)).run();
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
