import { accounts, inboxDecisions, transactionLines, transactions } from "@num/db";
import { Temporal } from "@num/shared";
import { and, eq, gte, inArray, isNull, lte, ne, type SQL } from "drizzle-orm";
import { pairKey } from "./decision-keys";
import { ServiceError } from "../service-error";
import { loadLines, replaceLines } from "./transaction-lines";
import { auditTransaction, readTransaction, toTransaction } from "./transaction-record";
import { hasOpenLine, hasTransferLine, isImported, lineCount, literal } from "./transaction-sql";
import type { WriteTx } from "./write";

type Row = ReturnType<typeof openRows>[number];

/** The fields of one side of a linked pair. An automatic link is not an edit, so the import can still be undone. */
function linkFields(peerId: string, editedAt: string | null) {
  if (editedAt === null) {
    return { transferPeerId: peerId, autoReason: "transfer_match" as const, autoSourceId: peerId, autoConfidence: 990 };
  }
  return { transferPeerId: peerId, autoReason: null, autoSourceId: null, autoConfidence: null, editedAt };
}

/** Links two existing rows as a transfer pair (no new mirror). With `editedAt` null, both rows become an automatic label. */
export function linkTransferPair(tx: WriteTx, leftId: string, rightId: string, editedAt: string | null): void {
  const left = tx.select().from(transactions).where(eq(transactions.id, leftId)).get();
  const right = tx.select().from(transactions).where(eq(transactions.id, rightId)).get();
  if (!left || !right || left.accountId === right.accountId) {
    throw new ServiceError("transfer_pair_not_found", 404);
  }
  if (left.transferPeerId || right.transferPeerId) {
    throw new ServiceError("transfer_pair_not_found", 404);
  }
  const leftLines = loadLines(tx, left.id);
  const rightLines = loadLines(tx, right.id);
  const leftBefore = toTransaction(tx, left, leftLines);
  const rightBefore = toTransaction(tx, right, rightLines);
  tx.update(transactions).set(linkFields(right.id, editedAt)).where(eq(transactions.id, left.id)).run();
  tx.update(transactions).set(linkFields(left.id, editedAt)).where(eq(transactions.id, right.id)).run();
  replaceLines(tx, left.id, [
    {
      amount: left.amount,
      memo: leftLines.length === 1 ? (leftLines[0]?.memo ?? null) : null,
      categoryId: null,
      transferAccountId: right.accountId,
      tagIds: [...new Set(leftLines.flatMap((line) => line.tagIds))],
    },
  ]);
  replaceLines(tx, right.id, [
    {
      amount: right.amount,
      memo: rightLines.length === 1 ? (rightLines[0]?.memo ?? null) : null,
      categoryId: null,
      transferAccountId: left.accountId,
      tagIds: [...new Set(rightLines.flatMap((line) => line.tagIds))],
    },
  ]);
  auditTransaction(tx, left.id, "update", leftBefore, readTransaction(tx, left.id));
  auditTransaction(tx, right.id, "update", rightBefore, readTransaction(tx, right.id));
}


/** Unlinked rows with one open line (no category, no transfer) in an on-budget account. Add the conditions on the row. */
function openRows(tx: WriteTx, ...conditions: SQL[]) {
  return tx
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      date: transactions.date,
      amount: transactions.amount,
      payee: transactions.payeeNormalized,
      imported: isImported,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        ...conditions,
        isNull(transactions.transferPeerId),
        eq(transactions.mirror, literal(0)),
        eq(accounts.onBudget, literal(1)),
        ne(transactions.amount, literal(0)),
        eq(lineCount(transactions.id), literal(1)),
        hasOpenLine(transactions.id),
      ),
    )
    .all();
}

/** Opposite rows in other accounts within 3 days that no recorded "no" excludes. Indexed by account, date and amount. */
function candidates(tx: WriteTx, row: Row) {
  const from = Temporal.PlainDate.from(row.date).subtract({ days: 3 }).toString();
  const to = Temporal.PlainDate.from(row.date).add({ days: 3 }).toString();
  const found = openRows(
    tx,
    ne(transactions.accountId, row.accountId),
    eq(transactions.amount, -row.amount),
    gte(transactions.date, from),
    lte(transactions.date, to),
  );
  if (found.length === 0) {
    return found;
  }
  const keys = found.map((other) => pairKey(row.id, other.id));
  const decided = new Set(
    tx
      .select({ itemKey: inboxDecisions.itemKey })
      .from(inboxDecisions)
      .where(inArray(inboxDecisions.itemKey, keys))
      .all()
      .map((item) => item.itemKey),
  );
  return found.filter((other) => !decided.has(pairKey(row.id, other.id)));
}

/** The payee is a confirmed transfer from this account to the other account. An automatic link has an auto reason, so it does not count. */
function learnedTransfer(tx: WriteTx, payee: string, fromAccountId: string, toAccountId: string) {
  if (payee.length === 0) {
    return false;
  }
  const learned = tx
    .select({ id: transactions.id })
    .from(transactionLines)
    .innerJoin(transactions, eq(transactionLines.transactionId, transactions.id))
    .where(
      and(
        eq(transactions.payeeNormalized, payee),
        eq(transactions.mirror, literal(0)),
        isNull(transactions.autoReason),
        eq(transactions.accountId, fromAccountId),
        eq(transactionLines.transferAccountId, toAccountId),
        eq(lineCount(transactions.id), literal(1)),
      ),
    )
    .limit(1)
    .get();
  return learned !== undefined;
}

/**
 * Links the row and its opposite row as a transfer pair (no new mirror) when exactly one candidate
 * exists for each, no "no" is recorded, and one payee is a learned transfer. Both rows become an automatic label.
 * A read never calls this. The 90-day limit of the pair list does not apply: a write has no `asOf`.
 */
export function linkTransferIfSure(tx: WriteTx, transactionId: string): void {
  const row = openRows(tx, eq(transactions.id, transactionId))[0];
  if (!row) {
    return;
  }
  const first = candidates(tx, row);
  const peer = first.length === 1 ? first[0] : undefined;
  if (!peer) {
    return;
  }
  const back = candidates(tx, peer);
  if (back.length !== 1 || back[0]?.id !== row.id) {
    return;
  }
  if (!row.imported && !peer.imported) {
    return;
  }
  if (!learnedTransfer(tx, row.payee, row.accountId, peer.accountId) && !learnedTransfer(tx, peer.payee, peer.accountId, row.accountId)) {
    return;
  }
  linkTransferPair(tx, row.id, peer.id, null);
}

/** The person unlinked a pair of two real rows ("Not a transfer"): record the same "no" as the pair question. */
export function recordPairNo(tx: WriteTx, leftId: string, rightId: string, at: string): void {
  const itemKey = pairKey(leftId, rightId);
  if (tx.select().from(inboxDecisions).where(eq(inboxDecisions.itemKey, itemKey)).get()) {
    return;
  }
  const row = { itemKey, decision: "not_transfer" as const, decidedAt: at };
  tx.insert(inboxDecisions).values(row).run();
  tx.audit({ entity: "inbox_decisions", entityId: itemKey, action: "create", before: null, after: row });
}

/**
 * The person confirmed a transfer (accepted a pair, set Transfer, or approved a transfer suggestion). The payee is
 * now a learned transfer: link the other open rows of the same payee key within 90 days of the confirmed row.
 * Call it once after a write or a batch. `except` holds the ids of the batch: targets and excluded rows stay as they are.
 */
export function linkLearnedTransfers(tx: WriteTx, confirmedIds: readonly string[], except: ReadonlySet<string>): void {
  for (const id of confirmedIds) {
    const row = tx
      .select({ payee: transactions.payeeNormalized, date: transactions.date })
      .from(transactions)
      .where(
        and(
          eq(transactions.id, id),
          eq(transactions.mirror, literal(0)),
          isNull(transactions.autoReason),
          eq(lineCount(transactions.id), literal(1)),
          hasTransferLine(transactions.id),
        ),
      )
      .get();
    if (!row || row.payee.length === 0) {
      continue;
    }
    const from = Temporal.PlainDate.from(row.date).subtract({ days: 90 }).toString();
    const to = Temporal.PlainDate.from(row.date).add({ days: 90 }).toString();
    const others = tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.payeeNormalized, row.payee),
          ne(transactions.id, id),
          isNull(transactions.transferPeerId),
          gte(transactions.date, from),
          lte(transactions.date, to),
        ),
      )
      .all();
    for (const other of others.filter((item) => !except.has(item.id))) {
      linkTransferIfSure(tx, other.id);
    }
  }
}
