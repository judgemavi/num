import { inboxDecisions } from "@num/db";
import { Temporal } from "@num/shared";
import { eq, inArray, sql } from "drizzle-orm";
import { transactionReconciled } from "./reconciled";
import { linkTransferPair } from "./suggestions";
import type { WriteTx } from "./write";

type Row = {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  payee: string;
  imported: number;
};

export function pairItemKey(leftId: string, rightId: string): string {
  return leftId < rightId ? `transfer_pair:${leftId}:${rightId}` : `transfer_pair:${rightId}:${leftId}`;
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
  const keys = found.map((other) => pairItemKey(row.id, other.id));
  const decided = new Set(
    tx
      .select({ itemKey: inboxDecisions.itemKey })
      .from(inboxDecisions)
      .where(inArray(inboxDecisions.itemKey, keys))
      .all()
      .map((item) => item.itemKey),
  );
  return found.filter((other) => !decided.has(pairItemKey(row.id, other.id)));
}

/** The payee is a confirmed transfer to this account. An automatic link has an auto reason, so it does not count. */
function learnedTransfer(tx: WriteTx, payee: string, accountId: string): boolean {
  if (payee.length === 0) {
    return false;
  }
  return (
    tx.all<{ found: number }>(sql`
      select 1 as found from transactions t
      inner join transaction_lines l on l.transaction_id = t.id
      where t.payee_normalized = ${payee} and t.mirror = 0 and t.auto_reason is null
        and l.transfer_account_id = ${accountId}
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
  if (!learnedTransfer(tx, row.payee, peer.accountId) && !learnedTransfer(tx, peer.payee, row.accountId)) {
    return;
  }
  if (transactionReconciled(tx, row.accountId, row.date) || transactionReconciled(tx, peer.accountId, peer.date)) {
    return;
  }
  linkTransferPair(tx, row.id, peer.id, null);
}

/** The person unlinked a pair of two real rows ("Not a transfer"): record the same "no" as the pair question (decision 0016). */
export function recordPairNo(tx: WriteTx, leftId: string, rightId: string, at: string): void {
  const itemKey = pairItemKey(leftId, rightId);
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
 */
export function linkLearnedTransfers(tx: WriteTx, confirmedIds: readonly string[]): void {
  for (const id of confirmedIds) {
    const row = tx.all<{ payee: string; date: string }>(sql`
      select payee_normalized as payee, date from transactions where id = ${id} and mirror = 0
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
    for (const other of others) {
      linkTransferIfSure(tx, other.id);
    }
  }
}
