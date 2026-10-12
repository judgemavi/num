import { inboxDecisions, transactions } from "@num/db";
import { Temporal } from "@num/shared";
import { eq, inArray, sql } from "drizzle-orm";
import { pairKey } from "./decision-keys";
import { transactionReconciled } from "./reconciled";
import { ServiceError } from "../service-error";
import { loadLines, replaceLines } from "./transaction-lines";
import { auditTransaction, readTransaction, toTransaction } from "./transaction-record";
import type { WriteTx } from "./write";

type Row = {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  payee: string;
  imported: number;
};

/** The fields of one side of a linked pair. An automatic link is not an edit, so the import can still be undone. */
function linkFields(peerId: string, editedAt: string | null) {
  if (editedAt === null) {
    return { transferPeerId: peerId, autoReason: "transfer_match", autoSourceId: peerId, autoConfidence: 990 };
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
  if (transactionReconciled(tx, left.accountId, left.date) || transactionReconciled(tx, right.accountId, right.date)) {
    throw new ServiceError("transaction_reconciled", 409);
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


/** An unlinked row with one open line (no category, no transfer) in an on-budget account. */
const openRow = sql`
  t.transfer_peer_id is null and t.mirror = 0 and a.on_budget = 1 and t.amount != 0
  and (select count(*) from transaction_lines l where l.transaction_id = t.id) = 1
  and exists (
    select 1 from transaction_lines l
    where l.transaction_id = t.id and l.category_id is null and l.transfer_account_id is null
  )
`;

const columns = sql`
  t.id as id, t.account_id as accountId, t.date as date, t.amount as amount, t.payee_normalized as payee,
  (t.source = 'import' or t.import_row_id is not null) as imported
`;

function readRow(tx: WriteTx, id: string): Row | undefined {
  return tx.all<Row>(sql`
    select ${columns} from transactions t inner join accounts a on a.id = t.account_id
    where t.id = ${id} and ${openRow}
  `)[0];
}

/** Opposite rows in other accounts within 3 days that no recorded "no" excludes. Indexed by account, date and amount. */
function candidates(tx: WriteTx, row: Row): Row[] {
  const from = Temporal.PlainDate.from(row.date).subtract({ days: 3 }).toString();
  const to = Temporal.PlainDate.from(row.date).add({ days: 3 }).toString();
  const found = tx.all<Row>(sql`
    select ${columns} from transactions t inner join accounts a on a.id = t.account_id
    where t.account_id <> ${row.accountId} and t.amount = ${-row.amount}
      and t.date >= ${from} and t.date <= ${to} and ${openRow}
  `);
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
function learnedTransfer(tx: WriteTx, payee: string, fromAccountId: string, toAccountId: string): boolean {
  if (payee.length === 0) {
    return false;
  }
  return (
    tx.all<{ found: number }>(sql`
      select 1 as found from transactions t
      inner join transaction_lines l on l.transaction_id = t.id
      where t.payee_normalized = ${payee} and t.mirror = 0 and t.auto_reason is null
        and t.account_id = ${fromAccountId} and l.transfer_account_id = ${toAccountId}
        and (select count(*) from transaction_lines x where x.transaction_id = t.id) = 1
      limit 1
    `).length > 0
  );
}

/**
 * Decision 0023. Links the row and its opposite row as a transfer pair (no new mirror) when exactly one candidate
 * exists for each, no "no" is recorded, and one payee is a learned transfer. Both rows become an automatic label.
 * A read never calls this. The 90-day limit of the pair list does not apply: a write has no `asOf`.
 */
export function linkTransferIfSure(tx: WriteTx, transactionId: string): void {
  const row = readRow(tx, transactionId);
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
  if (transactionReconciled(tx, row.accountId, row.date) || transactionReconciled(tx, peer.accountId, peer.date)) {
    return;
  }
  linkTransferPair(tx, row.id, peer.id, null);
}

/** The person unlinked a pair of two real rows ("Not a transfer"): record the same "no" as the pair question (decision 0016). */
export function recordPairNo(tx: WriteTx, leftId: string, rightId: string, at: string): void {
  const itemKey = pairKey(leftId, rightId);
  if (tx.select().from(inboxDecisions).where(eq(inboxDecisions.itemKey, itemKey)).get()) {
    return;
  }
  const row = { itemKey, decision: "not_transfer", reason: null, decidedAt: at };
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
    const row = tx.all<{ payee: string; date: string }>(sql`
      select t.payee_normalized as payee, t.date as date from transactions t
      where t.id = ${id} and t.mirror = 0 and t.auto_reason is null
        and (select count(*) from transaction_lines l where l.transaction_id = t.id) = 1
        and exists (select 1 from transaction_lines l where l.transaction_id = t.id and l.transfer_account_id is not null)
    `)[0];
    if (!row || row.payee.length === 0) {
      continue;
    }
    const from = Temporal.PlainDate.from(row.date).subtract({ days: 90 }).toString();
    const to = Temporal.PlainDate.from(row.date).add({ days: 90 }).toString();
    const others = tx.all<{ id: string }>(sql`
      select t.id as id from transactions t
      where t.payee_normalized = ${row.payee} and t.id <> ${id} and t.transfer_peer_id is null
        and t.date >= ${from} and t.date <= ${to}
    `);
    for (const other of others.filter((item) => !except.has(item.id))) {
      linkTransferIfSure(tx, other.id);
    }
  }
}
