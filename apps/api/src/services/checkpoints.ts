import { accounts, checkpoints, importBatches, transactions } from "@num/db";
import {
  accountKinds,
  utcNow,
  type AccountKind,
  type Checkpoint,
  type CheckpointCompare,
  type ClosingHint,
} from "@num/shared";
import { and, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { calculatedBalance } from "./checkpoint-balance";
import { checkpointHelp } from "./checkpoint-help";
import { checkpointOpeningSuggestion } from "./opening-suggestion";
import { auditTransaction, readTransaction } from "./transaction-record";
import { write, type AuditSource, type WriteTx } from "./write";

type WriteInput = {
  source: AuditSource;
  at?: string;
};

type Reader = Db | WriteTx;

type AccountRow = {
  id: string;
  kind: AccountKind;
  openingDate: string;
  openingBalance: number;
};

function asKind(value: string): AccountKind {
  if (!(accountKinds as readonly string[]).includes(value)) {
    throw new Error("Unknown account kind");
  }
  return value as AccountKind;
}

function requireAccount(db: Reader, id: string): AccountRow {
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
  return { ...row, kind: asKind(row.kind) };
}

function toCheckpoint(row: typeof checkpoints.$inferSelect): Checkpoint {
  return {
    id: row.id,
    accountId: row.accountId,
    date: row.date,
    statementBalance: row.statementBalance,
    createdAt: row.createdAt,
    unlockedAt: row.unlockedAt,
  };
}

function snapshot(row: Checkpoint) {
  return {
    accountId: row.accountId,
    date: row.date,
    statementBalance: row.statementBalance,
    createdAt: row.createdAt,
    unlockedAt: row.unlockedAt,
  };
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
        isNull(transactions.deletedAt),
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
            openingDate: account.openingDate,
            statementDate: input.date,
            transactions: helpTransactions(db, accountId, account.openingDate, input.date),
          }),
    openingSuggestion: checkpointOpeningSuggestion(db, account, {
      calculatedBalance: calculated,
      statementBalance: input.statementBalance,
    }),
  };
}

function reconcileThrough(tx: WriteTx, accountId: string, date: string): void {
  const rows = tx
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        isNull(transactions.deletedAt),
        lte(transactions.date, date),
      ),
    )
    .all();
  for (const row of rows) {
    const before = readTransaction(tx, row.id);
    if (before.status === "reconciled") {
      continue;
    }
    tx.update(transactions).set({ status: "reconciled" }).where(eq(transactions.id, row.id)).run();
    auditTransaction(tx, row.id, "update", before, readTransaction(tx, row.id));
  }
}

export function createCheckpoint(
  db: Db,
  accountId: string,
  input: { date: string; statementBalance: number } & WriteInput,
): Checkpoint {
  const preview = compareCheckpoint(db, accountId, input);
  if (!preview.balanced) {
    throw new ServiceError("checkpoint_unbalanced", 409, { difference: String(preview.difference) });
  }
  const at = input.at ?? utcNow();
  const id = crypto.randomUUID();
  let created: Checkpoint | undefined;
  write(db, { source: input.source, at }, (tx) => {
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
      after: snapshot(row),
    });
    reconcileThrough(tx, accountId, input.date);
    created = row;
  });
  if (!created) {
    throw new Error("Checkpoint was not created");
  }
  return created;
}

export function listCheckpoints(db: Db, accountId: string): { items: Checkpoint[] } {
  requireAccount(db, accountId);
  const items = db
    .select()
    .from(checkpoints)
    .where(eq(checkpoints.accountId, accountId))
    .all()
    .map(toCheckpoint)
    .sort((left, right) => {
      if (left.date !== right.date) {
        return left.date < right.date ? 1 : -1;
      }
      return left.id < right.id ? 1 : -1;
    });
  return { items };
}

function covered(dates: string[], transactionDate: string): boolean {
  return dates.some((date) => transactionDate <= date);
}

export function unlockCheckpoint(db: Db, accountId: string, checkpointId: string, input: WriteInput): Checkpoint {
  const at = input.at ?? utcNow();
  let unlocked: Checkpoint | undefined;
  write(db, { source: input.source, at }, (tx) => {
    requireAccount(tx, accountId);
    const row = tx.select().from(checkpoints).where(eq(checkpoints.id, checkpointId)).get();
    if (!row || row.accountId !== accountId) {
      throw new ServiceError("checkpoint_not_found", 404);
    }
    if (row.unlockedAt !== null) {
      throw new ServiceError("checkpoint_unlocked", 409);
    }
    const next = toCheckpoint({ ...row, unlockedAt: at });
    tx.update(checkpoints).set({ unlockedAt: at }).where(eq(checkpoints.id, checkpointId)).run();
    tx.audit({
      entity: "checkpoints",
      entityId: checkpointId,
      action: "unlock",
      before: snapshot(toCheckpoint(row)),
      after: snapshot(next),
    });
    const later = tx
      .select({ date: checkpoints.date })
      .from(checkpoints)
      .where(and(eq(checkpoints.accountId, accountId), isNull(checkpoints.unlockedAt)))
      .all()
      .map((item) => item.date);
    const rows = tx
      .select({ id: transactions.id, date: transactions.date, status: transactions.status })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, accountId),
          isNull(transactions.deletedAt),
          lte(transactions.date, row.date),
        ),
      )
      .all();
    for (const transaction of rows) {
      if (transaction.status !== "reconciled" || covered(later, transaction.date)) {
        continue;
      }
      const before = readTransaction(tx, transaction.id);
      tx.update(transactions).set({ status: "cleared" }).where(eq(transactions.id, transaction.id)).run();
      auditTransaction(tx, transaction.id, "update", before, readTransaction(tx, transaction.id));
    }
    unlocked = next;
  });
  if (!unlocked) {
    throw new Error("Checkpoint was not unlocked");
  }
  return unlocked;
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
    .all();
  rows.sort((left, right) => (left.createdAt < right.createdAt ? 1 : left.createdAt > right.createdAt ? -1 : 0));
  const latest = rows[0];
  if (!latest || latest.closingDate === null || latest.closingBalance === null) {
    return { closingDate: null, closingBalance: null };
  }
  return { closingDate: latest.closingDate, closingBalance: latest.closingBalance };
}
