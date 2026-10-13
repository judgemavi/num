import { checkpoints, importBatches } from "@num/db";
import { openingFromFirstRow, reconcileOpening, type OpeningSuggestion } from "@num/shared";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "../db";
import { hasTerms } from "./mortgage-terms";
import { earliestTransactionDate, effectiveOpeningDate } from "./opening-date";
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

export function importOpeningSuggestion(
  db: Reader,
  accountId: string,
  firstRow: { date: string; amount: number; balance: number } | null,
): OpeningSuggestion | null {
  if (!firstRow || hasTerms(db, accountId) || hasActiveCheckpoint(db, accountId) || hadRunningBalanceImport(db, accountId)) {
    return null;
  }
  return openingFromFirstRow(firstRow);
}

export function checkpointOpeningSuggestion(
  db: Reader,
  account: { id: string; openingBalance: number; openingDate: string | null },
  input: { calculatedBalance: number; statementBalance: number },
): OpeningSuggestion | null {
  if (hasTerms(db, account.id)) {
    return null;
  }
  const first = earliestTransactionDate(db, account.id);
  return reconcileOpening({
    hasCheckpoint: hasActiveCheckpoint(db, account.id),
    openingBalance: account.openingBalance,
    calculatedBalance: input.calculatedBalance,
    statementBalance: input.statementBalance,
    date: effectiveOpeningDate(db, { id: account.id, openingDate: first ? null : account.openingDate }),
  });
}
