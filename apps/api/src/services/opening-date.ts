import { idIn } from "./list-sql";
import { accounts, transactions } from "@num/db";
import { dayBefore } from "@num/shared";
import { eq, min, sql } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/sqlite-core";
import { ServiceError } from "../service-error";
import type { Reader } from "./write";

export function earliestTransactionDate(db: Reader, accountId: string): string | null {
  const row = db
    .select({ date: min(transactions.date) })
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .get();
  return row?.date ?? null;
}

const query = new QueryBuilder();
const firstDate = query.select({ date: min(transactions.date) }).from(transactions).where(eq(transactions.accountId, accounts.id));

/** The opening date that an account has when the person gives none. */
export type AutomaticOpening = { date: string; followsTransactions: boolean };

/**
 * The automatic opening date of each account: the day before its first transaction, or the day of its creation.
 * One query for any number of accounts.
 */
export function automaticOpenings(db: Reader, accountIds: readonly string[]): Map<string, AutomaticOpening> {
  const rows = db
    .select({ id: accounts.id, firstDate: sql<string | null>`${firstDate}`, createdOn: accounts.createdOn })
    .from(accounts)
    .where(idIn(accounts.id, [...accountIds]))
    .all();
  const found = new Map<string, AutomaticOpening>();
  for (const row of rows) {
    if (row.firstDate) {
      found.set(row.id, { date: dayBefore(row.firstDate), followsTransactions: true });
    } else {
      found.set(row.id, { date: row.createdOn, followsTransactions: false });
    }
  }
  return found;
}

export function automaticOpening(db: Reader, accountId: string): AutomaticOpening {
  const found = automaticOpenings(db, [accountId]).get(accountId);
  if (!found) {
    throw new ServiceError("account_not_found", 404);
  }
  return found;
}

export function effectiveOpeningDate(db: Reader, account: { id: string; openingDate: string | null }): string {
  return account.openingDate ?? automaticOpening(db, account.id).date;
}
