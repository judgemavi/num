import { accounts } from "@num/db";
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
import { mortgageSuggestion } from "./mortgage-learned";
import { transactionReconciled } from "./reconciled";
import { loadMatchBook, scorePayee } from "./match-book";
import { linkLearnedTransfers, linkTransferPair } from "./transfer-auto";
import { write, type AuditSource } from "./write";

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

export function suggestForPayee(db: Db, accountId: string, rawPayee: string, amount: number, date?: string): Suggestion {
  const account = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) {
    throw new ServiceError("account_not_found", 404);
  }
  const book = loadMatchBook(db);
  const payee = normalizePayee(rawPayee);
  const base = suggestionFromMatch(scorePayee(book, { payee, amount, recurring: null }));
  if (date === undefined || transactionReconciled(db, accountId, date)) {
    return base;
  }
  const mortgage = mortgageSuggestion(db, book.mortgageLearned, { payee, accountId, date, amount });
  return mortgage && mortgage.suggestion.confidence > base.confidence ? mortgage.suggestion : base;
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
    linkLearnedTransfers(tx, [leftId, rightId], new Set([leftId, rightId]));
  });
  return { leftId, rightId };
}
