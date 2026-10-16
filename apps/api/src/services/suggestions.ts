import { accounts, transactions } from "@num/db";
import {
  normalizePayee,
  oppositeTransferAccount,
  suggestionFromMatch,
  addDays,
  matchDateWindowDays,
  matchHistoryDays,
  transferPairs,
  utcNow,
  type Suggestion,
  type TransferPair,
} from "@num/shared";
import { and, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { mortgageSuggestion } from "./mortgage-learned";
import { isImported, lineCount, literal } from "./transaction-sql";
import { loadMatchBook, mortgageLearnedFor, scorePayee } from "./match-book";
import { linkLearnedTransfers, linkTransferPair } from "./transfer-auto";
import { write, type WriteInput } from "./write";

export function transferHint(db: Db, input: { accountId: string; date: string; amount: number }): { accountId: string | null } {
  const account = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, input.accountId)).get();
  if (!account) {
    throw new ServiceError("account_not_found", 404);
  }
  if (input.amount === 0) {
    return { accountId: null };
  }
  const start = addDays(input.date, -matchDateWindowDays);
  const end = addDays(input.date, matchDateWindowDays);
  const rows = db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      date: transactions.date,
      amount: transactions.amount,
      lineCount: lineCount(transactions.id),
    })
    .from(transactions)
    .where(
      and(
        isNull(transactions.transferPeerId),
        ne(transactions.accountId, input.accountId),
        eq(transactions.amount, -input.amount),
        gte(transactions.date, start),
        lte(transactions.date, end),
      ),
    )
    .all();
  return { accountId: oppositeTransferAccount(rows, input) };
}

export function suggestForPayee(db: Db, accountId: string, rawPayee: string, amount: number, date?: string): Suggestion {
  const account = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) {
    throw new ServiceError("account_not_found", 404);
  }
  const book = loadMatchBook(db);
  const payee = normalizePayee(rawPayee);
  const base = suggestionFromMatch(scorePayee(book, { payee, amount, recurring: null }));
  if (date === undefined) {
    return base;
  }
  const mortgage = mortgageSuggestion(db, mortgageLearnedFor(book, payee), { payee, accountId, date, amount });
  return mortgage && mortgage.confidence > base.confidence ? mortgage : base;
}

export function listTransferPairs(db: Db, asOf: string, only?: readonly string[]): { items: TransferPair[] } {
  const start = addDays(asOf, -matchHistoryDays);
  const rows = db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      date: transactions.date,
      amount: transactions.amount,
      imported: isImported,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        isNull(transactions.transferPeerId),
        eq(accounts.onBudget, literal(1)),
        ne(transactions.amount, literal(0)),
        gte(transactions.date, start),
        lte(transactions.date, asOf),
        only ? sql`abs(${transactions.amount}) in (select abs(amount) from transactions where id in (select value from json_each(${JSON.stringify(only)})))` : undefined,
      ),
    )
    .orderBy(sql`abs(${transactions.amount})`, transactions.date, transactions.id)
    .all();
  return {
    items: transferPairs(
      rows.map((row) => ({ ...row, onBudget: true, linked: false })),
      asOf,
    ).filter((pair) => !only || only.includes(pair.leftId) || only.includes(pair.rightId)),
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
