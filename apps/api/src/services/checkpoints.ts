import { accounts, checkpoints, importBatches, transactions } from "@num/db";
import {
  utcNow,
  type Checkpoint,
  type CheckpointCompare,
  type ClosingHint,
} from "@num/shared";
import { and, desc, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { calculatedBalance } from "./checkpoint-balance";
import { checkpointHelp } from "./checkpoint-help";
import { effectiveOpeningDate } from "./opening-date";
import { checkpointOpeningSuggestion } from "./opening-suggestion";
import { withoutId, write, type WriteInput, type Reader } from "./write";
import { requireWholeAmounts } from "./book-step";

function requireAccount(db: Reader, id: string) {
  const row = db
    .select({
      id: accounts.id,
      kind: accounts.kind,
      openingDate: accounts.openingDate,
      openingBalance: accounts.openingBalance,
    })
    .from(accounts)
    .where(eq(accounts.id, id))
    .get();
  if (!row) {
    throw new ServiceError("account_not_found", 404);
  }
  return row;
}

function helpTransactions(db: Reader, accountId: string, openingDate: string, statementDate: string) {
  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      status: transactions.status,
      payee: transactions.payeeRaw,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        gte(transactions.date, openingDate),
        lte(transactions.date, statementDate),
      ),
    )
    .all();
}

export function compareCheckpoint(
  db: Reader,
  accountId: string,
  input: { date: string; statementBalance: number },
): CheckpointCompare {
  const account = requireAccount(db, accountId);
  const openingDate = effectiveOpeningDate(db, account);
  const calculated = calculatedBalance(db, account, input.date);
  const difference = calculated - input.statementBalance;
  return {
    balanced: difference === 0,
    calculatedBalance: calculated,
    statementBalance: input.statementBalance,
    difference,
    help:
      difference === 0
        ? []
        : checkpointHelp({
            openingDate,
            statementDate: input.date,
            transactions: helpTransactions(db, accountId, openingDate, input.date),
          }),
    openingSuggestion: checkpointOpeningSuggestion(db, account, {
      calculatedBalance: calculated,
      statementBalance: input.statementBalance,
    }),
  };
}

export function createCheckpoint(
  db: Db,
  accountId: string,
  input: { date: string; statementBalance: number } & WriteInput,
): Checkpoint {
  requireWholeAmounts(db, [input.statementBalance]);
  const preview = compareCheckpoint(db, accountId, input);
  if (!preview.balanced) {
    throw new ServiceError("checkpoint_unbalanced", 409, { difference: String(preview.difference) });
  }
  const at = input.at ?? utcNow();
  const id = crypto.randomUUID();
  return write(db, { source: input.source, at }, (tx) => {
    const again = compareCheckpoint(tx, accountId, input);
    if (!again.balanced) {
      throw new ServiceError("checkpoint_unbalanced", 409, { difference: String(again.difference) });
    }
    const row: Checkpoint = {
      id,
      accountId,
      date: input.date,
      statementBalance: input.statementBalance,
      createdAt: at,
      unlockedAt: null,
    };
    tx.insert(checkpoints)
      .values(row)
      .run();
    tx.audit({
      entity: "checkpoints",
      entityId: id,
      action: "create",
      before: null,
      after: withoutId(row),
    });
    return row;
  });
}

export function listCheckpoints(db: Db, accountId: string): { items: Checkpoint[] } {
  requireAccount(db, accountId);
  const items = db
    .select()
    .from(checkpoints)
    .where(eq(checkpoints.accountId, accountId))
    .orderBy(desc(checkpoints.date), desc(checkpoints.id))
    .all();
  return { items };
}

export function unlockCheckpoint(db: Db, accountId: string, checkpointId: string, input: WriteInput): Checkpoint {
  const at = input.at ?? utcNow();
  return write(db, { source: input.source, at }, (tx) => {
    requireAccount(tx, accountId);
    const row = tx.select().from(checkpoints).where(eq(checkpoints.id, checkpointId)).get();
    if (!row || row.accountId !== accountId) {
      throw new ServiceError("checkpoint_not_found", 404);
    }
    if (row.unlockedAt !== null) {
      throw new ServiceError("checkpoint_unlocked", 409);
    }
    const next = { ...row, unlockedAt: at };
    tx.update(checkpoints).set({ unlockedAt: at }).where(eq(checkpoints.id, checkpointId)).run();
    tx.audit({
      entity: "checkpoints",
      entityId: checkpointId,
      action: "unlock",
      before: withoutId(row),
      after: withoutId(next),
    });
    return next;
  });
}

export function latestClosing(db: Db, accountId: string): ClosingHint {
  requireAccount(db, accountId);
  const rows = db
    .select({
      closingDate: importBatches.closingDate,
      closingBalance: importBatches.closingBalance,
      createdAt: importBatches.createdAt,
    })
    .from(importBatches)
    .where(
      and(
        eq(importBatches.accountId, accountId),
        isNull(importBatches.undoneAt),
        isNotNull(importBatches.closingDate),
        isNotNull(importBatches.closingBalance),
      ),
    )
    .orderBy(desc(importBatches.createdAt))
    .limit(1)
    .all();
  const latest = rows[0];
  if (!latest || latest.closingDate === null || latest.closingBalance === null) {
    return { closingDate: null, closingBalance: null };
  }
  return { closingDate: latest.closingDate, closingBalance: latest.closingBalance };
}
