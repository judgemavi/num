import { checkpoints, importBatches, transactions } from "@num/db";
import { dayBefore, openingFromFirstRow, reconcileOpening, type OpeningSuggestion } from "@num/shared";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "../db";
import type { WriteTx } from "./write";

type Reader = Db | WriteTx;

function hasActiveCheckpoint(db: Reader, accountId: string): boolean {
  return (
    db
      .select({ id: checkpoints.id })
      .from(checkpoints)
      .where(and(eq(checkpoints.accountId, accountId), isNull(checkpoints.unlockedAt)))
      .get() !== undefined
  );
}

function hadRunningBalanceImport(db: Reader, accountId: string): boolean {
  return (
    db
      .select({ id: importBatches.id })
      .from(importBatches)
      .where(
        and(
          eq(importBatches.accountId, accountId),
          eq(importBatches.parser, "csv"),
          isNull(importBatches.undoneAt),
          isNotNull(importBatches.closingBalance),
        ),
      )
      .get() !== undefined
  );
}

function earliestTransactionDate(db: Reader, accountId: string): string | null {
  const rows = db
    .select({ date: transactions.date })
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), isNull(transactions.deletedAt)))
    .all();
  let earliest: string | null = null;
  for (const row of rows) {
    if (earliest === null || row.date < earliest) {
      earliest = row.date;
    }
  }
  return earliest;
}

export function importOpeningSuggestion(
  db: Reader,
  accountId: string,
  firstRow: { date: string; amount: number; balance: number } | null,
): OpeningSuggestion | null {
  if (!firstRow || hasActiveCheckpoint(db, accountId) || hadRunningBalanceImport(db, accountId)) {
    return null;
  }
  return openingFromFirstRow(firstRow);
}

export function checkpointOpeningSuggestion(
  db: Reader,
  account: { id: string; openingBalance: number; openingDate: string },
  input: { calculatedBalance: number; statementBalance: number },
): OpeningSuggestion | null {
  const first = earliestTransactionDate(db, account.id);
  return reconcileOpening({
    hasCheckpoint: hasActiveCheckpoint(db, account.id),
    openingBalance: account.openingBalance,
    calculatedBalance: input.calculatedBalance,
    statementBalance: input.statementBalance,
    date: first ? dayBefore(first) : account.openingDate,
  });
}
