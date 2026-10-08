import { transactionLines, transactions } from "@num/db";
import { eq } from "drizzle-orm";
import { ServiceError } from "../service-error";
import { replaceLines, type StoredLine } from "./transaction-lines";
import { auditTransaction, readTransaction, toTransaction, type Header, type TxRow } from "./transaction-record";
import { lineTotal, transferLine, type NormalizedLine } from "./transaction-rules";
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
      status: header.status,
      source,
      importRowId: null,
      transferPeerId: sourceId,
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

function unlinkMirror(tx: WriteTx, sourceId: string, peer: TxRow, peerLines: StoredLine[], at: string): void {
  const before = toTransaction(peer, peerLines);
  tx.update(transactions).set({ transferPeerId: null }).where(eq(transactions.id, sourceId)).run();
  tx.update(transactions)
    .set({ transferPeerId: null, deletedAt: at })
    .where(eq(transactions.id, peer.id))
    .run();
  auditTransaction(tx, peer.id, "delete", before, readTransaction(tx, peer.id));
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
): void {
  const line = lines[0];
  if (lines.length !== 1 || !line || line.transferAccountId !== peer.accountId) {
    throw new ServiceError("mirror_one_line", 400);
  }
  const sourceLine = peerLines.find((item) => item.transferAccountId === existing.accountId);
  if (!sourceLine) {
    throw new Error("Transfer line is missing");
  }
  const before = toTransaction(existing, existingLines);
  const peerBefore = toTransaction(peer, peerLines);
  const sourceLineAmount = -header.amount;
  const peerAmount = lineTotal(
    peerLines.map((item) => ({
      amount: item.id === sourceLine.id ? sourceLineAmount : item.amount,
    })),
  );
  tx.update(transactions).set(header).where(eq(transactions.id, existing.id)).run();
  replaceLines(tx, existing.id, lines);
  tx.update(transactions)
    .set({ date: header.date, amount: peerAmount })
    .where(eq(transactions.id, peer.id))
    .run();
  tx.update(transactionLines)
    .set({ amount: sourceLineAmount, transferAccountId: header.accountId })
    .where(eq(transactionLines.id, sourceLine.id))
    .run();
  auditTransaction(tx, existing.id, "update", before, readTransaction(tx, existing.id));
  auditTransaction(tx, peer.id, "update", peerBefore, readTransaction(tx, peer.id));
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
      unlinkMirror(tx, existing.id, peer, peerLines, at);
    }
    auditTransaction(tx, existing.id, "update", before, readTransaction(tx, existing.id));
    return;
  }
  if (peer) {
    rewriteMirror(tx, existing, peer, peerLines, header, line);
  } else {
    insertMirror(tx, existing.id, header, existing.source, line.transferAccountId, line);
  }
  auditTransaction(tx, existing.id, "update", before, readTransaction(tx, existing.id));
}
