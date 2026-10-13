import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase } from "@num/db";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createBucketEvent } from "./bucket-events";
import { createBucket, readBucket, updateBucket } from "./buckets";
import { createCategory } from "./categories";
import { createTransaction } from "./transactions";

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-bucket-balance-"));
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

const saved = { source: "ui" as const, at: "2026-03-10T16:00:00Z" };

const spendingFields = {
  name: "Food",
  kind: "spending" as const,
  priority: 1,
  essential: false,
  color: "mint" as const,
  icon: "shopping-cart" as const,
  refillTo: 10_000,
  amount: null,
  dueDate: null,
  repeat: null,
  target: null,
  targetDate: null,
  fixedAmount: null,
};

function purchase(db: Db, accountId: string, categoryId: string, amount: number, date: string) {
  createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw: "Example shop",
    status: "open",
    lines: [{ amount, categoryId }],
    ...saved,
  });
}

test("bucket balance counts lines from the start date and events on all dates", () => {
  const book = tempDatabase();
  try {
    const account = createAccount(book.db, {
      name: "Cash",
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 100_000,
      ...saved,
    });
    const groceries = createCategory(book.db, { name: "Groceries", kind: "expense", ...saved });
    purchase(book.db, account.id, groceries.id, -1_000, "2026-03-09");
    purchase(book.db, account.id, groceries.id, -300, "2026-03-10");
    purchase(book.db, account.id, groceries.id, -200, "2026-03-11");

    const food = createBucket(book.db, { ...spendingFields, categoryIds: [groceries.id], asOf: "2026-03-10", ...saved });
    expect(food.startDate).toBe("2026-03-10");
    expect(food.balance).toBe(-500);

    createBucketEvent(book.db, food.id, { kind: "fund", amount: 5_000, date: "2026-03-01", asOf: "2026-03-11", ...saved });
    expect(readBucket(book.db, food.id).balance).toBe(4_500);

    const earlier = updateBucket(book.db, food.id, {
      ...spendingFields,
      categoryIds: [groceries.id],
      startDate: "2026-03-09",
      ...saved,
    });
    expect(earlier.startDate).toBe("2026-03-09");
    expect(earlier.balance).toBe(3_500);
  } finally {
    book.close();
  }
});
