import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accounts, migrateDatabase, openDatabase, settings } from "@num/db";
import type { AccountKind, ErrorCode, Transaction, TransactionCreate, TransactionLineInput } from "@num/shared";
import { Database } from "bun:sqlite";
import { expect } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db";
import { ServiceError } from "../service-error";
import { createAccount } from "./accounts";
import { map } from "./import-test-book";
import { compareCheckpoint, createCheckpoint } from "./checkpoints";
import { createTransaction, getTransaction } from "./transactions";

export function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-transactions-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "CAD" }).run();
  return {
    db,
    sqlite,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const at = "2026-10-07T16:00:00Z";

export const saved = { source: "ui" as const, at };

export function expectCode(run: () => void, code: ErrorCode) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceError);
    expect((error as ServiceError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

export function account(db: Db, name: string, kind: AccountKind) {
  return createAccount(db, {
    name,
    kind,
    openingDate: "2026-01-01",
    openingBalance: 0,
    ...saved,
  });
}

/** The account gets imports: it has a column map. A new manual transaction or mirror in it is `open` (decision 0052). */
export function getsImports(db: Db, accountId: string) {
  db.update(accounts).set({ columnMap: map }).where(eq(accounts.id, accountId)).run();
}

export function entry(
  accountId: string,
  amount: number,
  lines: TransactionLineInput[],
  date = "2026-03-01",
): TransactionCreate & typeof saved {
  return {
    accountId,
    date,
    amount,
    payeeRaw: "Example shop",
    lines,
    ...saved,
  };
}

export function countWrites(sqlite: Database, run: () => void): number {
  const original = sqlite.transaction.bind(sqlite);
  let count = 0;
  sqlite.transaction = ((fn: () => unknown) => {
    count += 1;
    return original(fn);
  }) as typeof sqlite.transaction;
  try {
    run();
  } finally {
    sqlite.transaction = original;
  }
  return count;
}

export function requirePeer(db: Db, record: Transaction): Transaction {
  if (!record.transferPeerId) {
    throw new Error("Transfer peer is missing");
  }
  const peer = getTransaction(db, record.transferPeerId);
  if (!peer) {
    throw new Error("Transfer peer is missing");
  }
  return peer;
}

/**
 * A Maybe row: a reconciled row with no category whose suggestion is a learned transfer to `otherAccountId`. Approve
 * cannot apply a transfer to a reconciled row (decision 0051). The rows are in January.
 */
export function reconciledTransferRow(db: Db, accountId: string, otherAccountId: string) {
  const move = (date: string, transferAccountId: string | null) =>
    createTransaction(db, { accountId, date, amount: -30_000, payeeRaw: "Rent move", lines: [{ amount: -30_000, transferAccountId }], ...saved });
  move("2026-01-05", otherAccountId);
  move("2026-01-06", otherAccountId);
  const row = move("2026-01-20", null);
  const balance = compareCheckpoint(db, accountId, { date: "2026-01-20", statementBalance: 0 }).calculatedBalance;
  createCheckpoint(db, accountId, { date: "2026-01-20", statementBalance: balance, ...saved });
  return row;
}
