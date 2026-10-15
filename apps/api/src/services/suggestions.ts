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
  const start = Temporal.PlainDate.from(input.date).subtract({ days: 3 }).toString();
  const end = Temporal.PlainDate.from(input.date).add({ days: 3 }).toString();
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

export function listTransferPairs(db: Db, asOf: string): { items: TransferPair[] } {
  const start = Temporal.PlainDate.from(asOf).subtract({ days: 90 }).toString();
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
      ),
    )
    .orderBy(sql`abs(${transactions.amount})`, transactions.date, transactions.id)
    .all();
  return {
    items: transferPairs(
      rows.map((row) => ({ ...row, onBudget: true, linked: false })),
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
