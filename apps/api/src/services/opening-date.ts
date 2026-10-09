import { auditLog, transactions } from "@num/db";
import { dayBefore, Temporal } from "@num/shared";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import type { WriteTx } from "./write";

type Reader = Db | WriteTx;

function plainDate(at: string): string {
  return Temporal.Instant.from(at).toZonedDateTimeISO("UTC").toPlainDate().toString();
}

export function earliestTransactionDate(db: Reader, accountId: string): string | null {
  const row = db
    .select({ date: sql<string | null>`min(${transactions.date})` })
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .get();
  return row?.date ?? null;
}

function createdAt(db: Reader, accountId: string): string {
  const row = db
    .select({ at: auditLog.at })
    .from(auditLog)
    .where(and(eq(auditLog.entity, "accounts"), eq(auditLog.entityId, accountId), eq(auditLog.action, "create")))
    .get();
  if (!row) {
    throw new Error("Account has no creation record");
  }
  return row.at;
}

export function effectiveOpeningDate(db: Reader, account: { id: string; openingDate: string | null }): string {
  if (account.openingDate) {
    return account.openingDate;
  }
  const earliest = earliestTransactionDate(db, account.id);
  if (earliest) {
    return dayBefore(earliest);
  }
  return plainDate(createdAt(db, account.id));
}
