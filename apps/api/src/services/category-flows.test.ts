import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accounts, categories, migrateDatabase, openDatabase, transactionLines, transactions } from "@num/db";
import { expect, test } from "bun:test";
import { createDb } from "../db";
import { categoryFlows } from "./category-flows";

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-flows-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  return {
    db: createDb(sqlite),
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function addAccount(db: ReturnType<typeof tempDatabase>["db"], name: string) {
  const id = crypto.randomUUID();
  db.insert(accounts)
    .values({
      id,
      name,
      kind: "chequing",
      onBudget: true,
      openingDate: "2026-01-01",
      openingBalance: 0,
    })
    .run();
  return id;
}

function addCategory(db: ReturnType<typeof tempDatabase>["db"], name: string, kind: "income" | "expense") {
  const id = crypto.randomUUID();
  db.insert(categories)
    .values({
      id,
      name,
      kind,
      essential: false,
    })
    .run();
  return id;
}

function addLine(
  db: ReturnType<typeof tempDatabase>["db"],
  accountId: string,
  amount: number,
  categoryId: string | null,
  transferAccountId: string | null,
  deleted = false,
) {
  const id = crypto.randomUUID();
  db.insert(transactions)
    .values({
      id,
      accountId,
      date: "2026-03-01",
      amount,
      payeeRaw: "Example shop",
      status: "cleared",
      source: "manual",
      deletedAt: deleted ? "2026-10-07T16:00:00Z" : null,
    })
    .run();
  db.insert(transactionLines)
    .values({
      id: crypto.randomUUID(),
      transactionId: id,
      amount,
      categoryId,
      transferAccountId,
    })
    .run();
}

test("a refund decreases spending", () => {
  const book = tempDatabase();
  try {
    const accountId = addAccount(book.db, "Cash");
    const groceries = addCategory(book.db, "Groceries", "expense");
    addLine(book.db, accountId, -500, groceries, null);
    expect(categoryFlows(book.db)).toEqual({ spending: -500, income: 0 });

    addLine(book.db, accountId, 120, groceries, null);
    expect(categoryFlows(book.db).spending).toBe(-380);

    addLine(book.db, accountId, -900, groceries, null, true);
    expect(categoryFlows(book.db)).toEqual({ spending: -380, income: 0 });
  } finally {
    book.close();
  }
});

test("transfers are not spending or income", () => {
  const book = tempDatabase();
  try {
    const cash = addAccount(book.db, "Cash");
    const savings = addAccount(book.db, "Savings");
    const pay = addCategory(book.db, "Pay", "income");
    const groceries = addCategory(book.db, "Groceries", "expense");
    addLine(book.db, cash, 2_000, pay, null);
    addLine(book.db, cash, -80, groceries, null);
    addLine(book.db, cash, -400, null, savings);
    addLine(book.db, cash, -25, null, null);
    expect(categoryFlows(book.db)).toEqual({ spending: -80, income: 2_000 });
  } finally {
    book.close();
  }
});
