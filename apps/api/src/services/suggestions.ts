import { accounts, transactions } from "@num/db";
import {
  normalizePayee,
  oppositeTransferAccount,
  suggestionFromMatch,
  Temporal,
  transferPairs,
  utcNow,
  type Suggestion,
  type TransferPair,
} from "@num/shared";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { transactionReconciled } from "./reconciled";
import { loadMatchBook, scorePayee } from "./match-book";
import { loadLines, replaceLines } from "./transaction-lines";
import { auditTransaction, readTransaction, toTransaction } from "./transaction-record";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

export function transferHint(db: Db, input: { accountId: string; date: string; amount: number }): { accountId: string | null } {
  const account = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, input.accountId)).get();
  if (!account) {
    throw new ServiceError("account_not_found", 404);
  }
  if (input.amount === 0) {
    return { accountId: null };
  }
  const start = Temporal.PlainDate.from(input.date).subtract({ days: 3 }).toString();
  const end = Temporal.PlainDate.from(input.date).add({ days: 3 }).toString();
  const rows = db.all<{ id: string; accountId: string; date: string; amount: number; status: string; lineCount: number }>(sql`
    select
      t.id as id,
      t.account_id as accountId,
      t.date as date,
      t.amount as amount,
      t.status as status,
      (select count(*) from transaction_lines l where l.transaction_id = t.id) as lineCount
    from transactions t
    where 1 = 1
      and t.transfer_peer_id is null
      and t.account_id <> ${input.accountId}
      and t.amount = ${-input.amount}
      and t.date >= ${start}
      and t.date <= ${end}
  `);
  return {
    accountId: oppositeTransferAccount(
      rows.map((row) => ({
        id: row.id,
        accountId: row.accountId,
        date: row.date,
        amount: row.amount,
        lineCount: Number(row.lineCount),
        reconciled: transactionReconciled(db, row.accountId, row.date),
      })),
      input,
    ),
  };
}

export function suggestForPayee(db: Db, accountId: string, rawPayee: string, amount: number): Suggestion {
  const account = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) {
    throw new ServiceError("account_not_found", 404);
  }
  const book = loadMatchBook(db);
  return suggestionFromMatch(scorePayee(book, { payee: normalizePayee(rawPayee), amount, recurring: null }));
}

export function listTransferPairs(db: Db, asOf: string): { items: TransferPair[] } {
  const start = Temporal.PlainDate.from(asOf).subtract({ days: 90 }).toString();
  const rows = db.all<{ id: string; accountId: string; date: string; amount: number; imported: number }>(sql`
    select t.id as id, t.account_id as accountId, t.date as date, t.amount as amount,
      (t.source = 'import' or t.import_row_id is not null) as imported
    from transactions t
    inner join accounts a on a.id = t.account_id
    where 1 = 1
      and t.transfer_peer_id is null
      and a.on_budget = 1
      and t.amount != 0
      and t.date >= ${start}
      and t.date <= ${asOf}
    order by abs(t.amount), t.date, t.id
  `);
  return {
    items: transferPairs(
      rows.map((row) => ({ ...row, onBudget: true, linked: false, imported: row.imported === 1 })),
      asOf,
    ),
  };
}

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

export function acceptTransferPair(db: Db, asOf: string, leftId: string, rightId: string, input: WriteInput) {
  const ready = listTransferPairs(db, asOf).items.some(
    (pair) =>
      (pair.leftId === leftId && pair.rightId === rightId) || (pair.leftId === rightId && pair.rightId === leftId),
  );
  if (!ready) {
    throw new ServiceError("transfer_pair_not_found", 404);
  }
  write(db, { source: input.source, at: input.at }, (tx) => {
    linkTransferPair(tx, leftId, rightId, input.at ?? utcNow());
  });
  return { leftId, rightId };
}
