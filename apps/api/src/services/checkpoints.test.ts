import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog, migrateDatabase, openDatabase, valuations } from "@num/db";
import { storedStatementBalance, type ErrorCode, type TransactionCreate, type TransactionLineInput } from "@num/shared";
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db";
import { ServiceError } from "../service-error";
import { createAccount } from "./accounts";
import { compareCheckpoint, createCheckpoint, unlockCheckpoint } from "./checkpoints";
import { setClearance } from "./transaction-clearance";
import { createTransaction, deleteTransaction, getTransaction, updateTransaction } from "./transactions";

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-checkpoints-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  return {
    db: createDb(sqlite),
    sqlite,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const at = "2026-10-07T16:00:00Z";
const saved = { source: "ui" as const, at };

function expectCode(run: () => void, code: ErrorCode) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceError);
    expect((error as ServiceError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

function countWrites(sqlite: Database, run: () => void): number {
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

function account(db: Db, openingBalance = 0) {
  return createAccount(db, {
    name: "Chequing",
    kind: "chequing",
    openingDate: "2026-01-01",
    openingBalance,
    ...saved,
  });
}

function entry(
  accountId: string,
  amount: number,
  date: string,
  status: "open" | "cleared" = "open",
): TransactionCreate & typeof saved {
  const lines: TransactionLineInput[] = [{ amount }];
  return {
    accountId,
    date,
    amount,
    payeeRaw: "Example shop",
    status,
    lines,
    ...saved,
  };
}

test("a checkpoint is created only when the balances are equal, and only rows on or before the date are reconciled", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, 1_000);
    const before = createTransaction(book.db, entry(chequing.id, -200, "2026-02-01", "cleared"));
    const onDate = createTransaction(book.db, entry(chequing.id, -300, "2026-02-15"));
    const after = createTransaction(book.db, entry(chequing.id, -400, "2026-02-20"));
    const removed = createTransaction(book.db, entry(chequing.id, -50, "2026-02-10"));
    deleteTransaction(book.db, removed.id, saved);

    const mismatch = compareCheckpoint(book.db, chequing.id, { date: "2026-02-15", statementBalance: 400 });
    expect(mismatch.balanced).toBe(false);
    expect(mismatch.difference).toBe(100);
    expect(countWrites(book.sqlite, () => {
      expectCode(
        () => createCheckpoint(book.db, chequing.id, { date: "2026-02-15", statementBalance: 400, ...saved }),
        "checkpoint_unbalanced",
      );
    })).toBe(0);
    expect(getTransaction(book.db, onDate.id)?.status).toBe("open");

    let createdId = "";
    expect(countWrites(book.sqlite, () => {
      const created = createCheckpoint(book.db, chequing.id, { date: "2026-02-15", statementBalance: 500, ...saved });
      createdId = created.id;
      expect(created.statementBalance).toBe(500);
      expect(created.unlockedAt).toBeNull();
    })).toBe(1);

    expect(getTransaction(book.db, before.id)?.reconciled).toBe(true);
    expect(getTransaction(book.db, before.id)?.status).toBe("cleared");
    expect(getTransaction(book.db, onDate.id)?.reconciled).toBe(true);
    expect(getTransaction(book.db, onDate.id)?.status).toBe("open");
    expect(getTransaction(book.db, after.id)?.reconciled).toBe(false);
    expect(getTransaction(book.db, removed.id)).toBeNull();

    expectCode(
      () =>
        updateTransaction(book.db, onDate.id, {
          ...entry(chequing.id, -301, "2026-02-15"),
        }),
      "transaction_reconciled",
    );
    expectCode(
      () => setClearance(book.db, chequing.id, { transactionIds: [onDate.id], status: "open", ...saved }),
      "transaction_reconciled",
    );
    expect(getTransaction(book.db, onDate.id)?.amount).toBe(-300);

    const unlocked = unlockCheckpoint(book.db, chequing.id, createdId, { ...saved, at: "2026-10-08T16:00:00Z" });
    expect(unlocked.unlockedAt).toBe("2026-10-08T16:00:00Z");
    expect(getTransaction(book.db, before.id)?.reconciled).toBe(false);
    expect(getTransaction(book.db, before.id)?.status).toBe("cleared");
    expect(getTransaction(book.db, onDate.id)?.reconciled).toBe(false);
    expect(getTransaction(book.db, onDate.id)?.status).toBe("open");
    expect(getTransaction(book.db, after.id)?.reconciled).toBe(false);

    const unlocks = book.db.select().from(auditLog).where(eq(auditLog.action, "unlock")).all();
    expect(unlocks).toHaveLength(1);
    expect(unlocks[0]?.entity).toBe("checkpoints");
    expect(unlocks[0]?.entityId).toBe(createdId);
    expect(unlocks[0]?.source).toBe("ui");

    expectCode(() => unlockCheckpoint(book.db, chequing.id, createdId, saved), "checkpoint_unlocked");

    const edited = updateTransaction(book.db, onDate.id, entry(chequing.id, -301, "2026-02-15"));
    expect(edited.amount).toBe(-301);
    const cleared = setClearance(book.db, chequing.id, { transactionIds: [before.id], status: "open", ...saved });
    expect(cleared.updated).toBe(1);
    expect(getTransaction(book.db, before.id)?.status).toBe("open");
  } finally {
    book.close();
  }
});

test("difference help finds a duplicate and a gap", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db);
    const first = createTransaction(book.db, entry(chequing.id, -100, "2026-01-02"));
    const copy = createTransaction(book.db, entry(chequing.id, -100, "2026-01-04"));
    const later = createTransaction(book.db, entry(chequing.id, -50, "2026-01-25"));
    const result = compareCheckpoint(book.db, chequing.id, { date: "2026-01-25", statementBalance: 0 });
    expect(result.balanced).toBe(false);
    expect(result.calculatedBalance).toBe(-250);
    expect(result.difference).toBe(-250);
    expect(result.help).toContainEqual({
      code: "duplicate",
      transactions: [
        { id: first.id, date: "2026-01-02", payee: "Example shop", amount: -100 },
        { id: copy.id, date: "2026-01-04", payee: "Example shop", amount: -100 },
      ],
    });
    expect(result.help).toContainEqual({ code: "gap", from: "2026-01-05", to: "2026-01-24" });
    expect(result.help).toContainEqual({
      code: "uncleared",
      transaction: { id: later.id, date: "2026-01-25", payee: "Example shop", amount: -50 },
    });
    expect(result.help.some((item) => item.code === "uncleared" && item.transaction.id === first.id)).toBe(false);
  } finally {
    book.close();
  }
});

test("help ignores rows after the statement date", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db);
    const onDate = createTransaction(book.db, entry(chequing.id, -40, "2026-01-25"));
    const after = createTransaction(book.db, entry(chequing.id, -40, "2026-01-27"));
    const laterCopy = createTransaction(book.db, entry(chequing.id, -40, "2026-01-28"));
    const result = compareCheckpoint(book.db, chequing.id, { date: "2026-01-25", statementBalance: 0 });
    expect(result.calculatedBalance).toBe(-40);
    const flagged = result.help.flatMap((item) => {
      if (item.code === "uncleared") {
        return [item.transaction.id];
      }
      if (item.code === "duplicate") {
        return [item.transactions[0].id, item.transactions[1].id];
      }
      return [];
    });
    expect(flagged).toContain(onDate.id);
    expect(flagged).not.toContain(after.id);
    expect(flagged).not.toContain(laterCopy.id);
  } finally {
    book.close();
  }
});

test("a liability checkpoint stores the negated printed amount", () => {
  const book = tempDatabase();
  try {
    const card = createAccount(book.db, {
      name: "Card",
      kind: "credit_card",
      openingDate: "2026-01-01",
      openingBalance: 0,
      paymentPolicy: "full",
      ...saved,
    });
    const charge = createTransaction(book.db, entry(card.id, -180_636, "2026-02-15"));
    const printed = 180_636;
    const stored = storedStatementBalance(card.kind, printed);
    expect(stored).toBe(-180_636);
    const created = createCheckpoint(book.db, card.id, { date: "2026-02-15", statementBalance: stored, ...saved });
    expect(created.statementBalance).toBe(-180_636);
    expect(getTransaction(book.db, charge.id)?.reconciled).toBe(true);
  } finally {
    book.close();
  }
});

test("an investment checkpoint uses the valuation and later transactions", () => {
  const book = tempDatabase();
  try {
    const fund = createAccount(book.db, {
      name: "Fund",
      kind: "investment",
      openingDate: "2026-01-01",
      openingBalance: 100,
      ...saved,
    });
    book.db.insert(valuations).values({ id: crypto.randomUUID(), accountId: fund.id, date: "2026-02-01", balance: 50_000 }).run();
    const before = createTransaction(book.db, entry(fund.id, 9_999, "2026-01-15"));
    const afterValuation = createTransaction(book.db, entry(fund.id, -1_000, "2026-02-10"));
    const afterStatement = createTransaction(book.db, entry(fund.id, -5_000, "2026-03-01"));
    const compared = compareCheckpoint(book.db, fund.id, { date: "2026-02-15", statementBalance: 49_000 });
    expect(compared.balanced).toBe(true);
    expect(compared.calculatedBalance).toBe(49_000);
    createCheckpoint(book.db, fund.id, { date: "2026-02-15", statementBalance: 49_000, ...saved });
    expect(getTransaction(book.db, before.id)?.reconciled).toBe(true);
    expect(getTransaction(book.db, afterValuation.id)?.reconciled).toBe(true);
    expect(getTransaction(book.db, afterStatement.id)?.status).toBe("open");
  } finally {
    book.close();
  }
});

test("a checkpoint does not reconcile the mirror in the other account", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db);
    const savings = createAccount(book.db, {
      name: "Savings",
      kind: "savings",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const transfer = createTransaction(book.db, {
      ...entry(chequing.id, -200, "2026-02-15"),
      lines: [{ amount: -200, transferAccountId: savings.id }],
    });
    const mirrorId = transfer.transferPeerId;
    if (!mirrorId) {
      throw new Error("Transfer has no mirror");
    }
    createCheckpoint(book.db, chequing.id, { date: "2026-02-15", statementBalance: -200, ...saved });
    expect(getTransaction(book.db, transfer.id)?.reconciled).toBe(true);
    expect(getTransaction(book.db, mirrorId)?.status).toBe("open");
  } finally {
    book.close();
  }
});

test("unlock leaves transactions reconciled when a later checkpoint still covers them", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, 1_000);
    const early = createTransaction(book.db, entry(chequing.id, -200, "2026-02-01"));
    const late = createTransaction(book.db, entry(chequing.id, -400, "2026-02-20"));
    const first = createCheckpoint(book.db, chequing.id, { date: "2026-02-15", statementBalance: 800, ...saved });
    createCheckpoint(book.db, chequing.id, { date: "2026-02-20", statementBalance: 400, ...saved });
    unlockCheckpoint(book.db, chequing.id, first.id, saved);
    expect(getTransaction(book.db, early.id)?.reconciled).toBe(true);
    expect(getTransaction(book.db, late.id)?.reconciled).toBe(true);
  } finally {
    book.close();
  }
});

test("reconcile suggests an opening balance only when the account has no checkpoint", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, 1_000);
    createTransaction(book.db, entry(chequing.id, -200, "2026-02-01"));
    const open = compareCheckpoint(book.db, chequing.id, { date: "2026-02-15", statementBalance: 400 });
    expect(open.difference).not.toBe(0);
    expect(open.openingSuggestion).toEqual({ amount: 600, date: "2026-01-31" });
    expect(600 + (open.calculatedBalance - 1_000)).toBe(open.statementBalance);

    createCheckpoint(book.db, chequing.id, { date: "2026-02-15", statementBalance: 800, ...saved });
    const locked = compareCheckpoint(book.db, chequing.id, { date: "2026-02-15", statementBalance: 400 });
    expect(locked.balanced).toBe(false);
    expect(locked.openingSuggestion).toBeNull();
  } finally {
    book.close();
  }
});
