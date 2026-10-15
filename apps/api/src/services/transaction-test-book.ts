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
import { getTransaction } from "./transactions";

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

/** The account gets imports: it has a column map. A new manual transaction or mirror in it is `open`. */
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
