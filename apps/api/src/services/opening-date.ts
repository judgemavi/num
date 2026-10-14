import { accounts, auditLog, transactions } from "@num/db";
import { dayBefore, Temporal } from "@num/shared";
import { and, eq, inArray, min, sql } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/sqlite-core";
import type { Reader } from "./write";

function plainDate(at: string) {
  return Temporal.Instant.from(at).toZonedDateTimeISO("UTC").toPlainDate().toString();
}

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
const createdAt = query
  .select({ at: auditLog.at })
  .from(auditLog)
  .where(and(eq(auditLog.entity, "accounts"), eq(auditLog.entityId, accounts.id), eq(auditLog.action, "create")));

/** The opening date that an account has when the person gives none. */
export type AutomaticOpening = { date: string; followsTransactions: boolean };

/**
 * The automatic opening date of each account: the day before its first transaction, or the day of its creation.
 * One query for any number of accounts.
 */
export function automaticOpenings(db: Reader, accountIds: readonly string[]): Map<string, AutomaticOpening> {
  const rows = db
    .select({ id: accounts.id, firstDate: sql<string | null>`${firstDate}`, createdAt: sql<string | null>`${createdAt}` })
    .from(accounts)
    .where(inArray(accounts.id, [...accountIds]))
    .all();
  const found = new Map<string, AutomaticOpening>();
  for (const row of rows) {
    if (row.firstDate) {
      found.set(row.id, { date: dayBefore(row.firstDate), followsTransactions: true });
    } else if (row.createdAt) {
      found.set(row.id, { date: plainDate(row.createdAt), followsTransactions: false });
    } else {
      throw new Error("Account has no creation record");
    }
  }
  return found;
}

export function automaticOpening(db: Reader, accountId: string): AutomaticOpening {
  const found = automaticOpenings(db, [accountId]).get(accountId);
  if (!found) {
    throw new Error("Account has no creation record");
  }
  return found;
}

export function effectiveOpeningDate(db: Reader, account: { id: string; openingDate: string | null }): string {
  return account.openingDate ?? automaticOpening(db, account.id).date;
}
