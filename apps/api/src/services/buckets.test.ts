import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bucketEvents, fundingRuns, migrateDatabase, openDatabase } from "@num/db";
import type { ErrorCode } from "@num/shared";
import { eq } from "drizzle-orm";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { ServiceError } from "../service-error";
import { createAccount } from "./accounts";
import { coverBucket, createBucketEvent, undoBucketEvent } from "./bucket-events";
import { createBucket, readBucket, updateBucket } from "./buckets";
import { createCategory } from "./categories";
import { createTransaction, deleteTransaction } from "./transactions";

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-buckets-"));
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

function expense(db: Db, name: string) {
  return createCategory(db, { name, kind: "expense", source: "ui", at });
}

function spending(db: Db, name: string, categoryIds: string[], refillTo = 10_000) {
  return createBucket(db, {
    name,
    kind: "spending",
    priority: 1,
    essential: false,
    color: "mint",
    icon: "shopping-cart",
    categoryIds,
    refillTo,
    amount: null,
    dueDate: null,
    repeat: null,
    target: null,
    targetDate: null,
    fixedAmount: null,
    ...saved,
  });
}

function purchase(db: Db, accountId: string, categoryId: string, amount: number, date = "2026-03-01") {
  return createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw: "Example shop",
    status: "open",
    lines: [{ amount, categoryId }],
    ...saved,
  });
}

test("bucket balance is funds, moves, releases and category lines", () => {
  const book = tempDatabase();
  try {
    const account = createAccount(book.db, {
      name: "Cash",
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const groceries = expense(book.db, "Groceries");
    const pay = createCategory(book.db, { name: "Pay", kind: "income", ...saved });
    const food = spending(book.db, "Groceries", [groceries.id]);
    const other = spending(book.db, "Other", []);
    createBucketEvent(book.db, food.id, { kind: "fund", amount: 10_000, date: "2026-03-01", ...saved });
    createBucketEvent(book.db, food.id, {
      kind: "move",
      amount: 2_000,
      date: "2026-03-02",
      otherBucketId: other.id,
      ...saved,
    });
    createBucketEvent(book.db, other.id, {
      kind: "move",
      amount: 500,
      date: "2026-03-03",
      otherBucketId: food.id,
      ...saved,
    });
    createBucketEvent(book.db, food.id, { kind: "release", amount: 1_000, date: "2026-03-04", ...saved });
    purchase(book.db, account.id, groceries.id, -3_000, "2026-03-05");
    purchase(book.db, account.id, groceries.id, 400, "2026-03-06");
    const ignored = createBucketEvent(book.db, food.id, { kind: "fund", amount: 9_999, date: "2026-03-07", ...saved });
    undoBucketEvent(book.db, food.id, ignored.id, saved);
    const removed = purchase(book.db, account.id, groceries.id, -500, "2026-03-08");
    deleteTransaction(book.db, removed.id, saved);

    const income = purchase(book.db, account.id, pay.id, 100, "2026-03-09");
    const activeRun = crypto.randomUUID();
    const undoneRun = crypto.randomUUID();
    book.db
      .insert(fundingRuns)
      .values([
        { id: activeRun, incomeTransactionId: income.id, date: "2026-03-09", createdAt: at, undoneAt: null },
        { id: undoneRun, incomeTransactionId: income.id, date: "2026-03-10", createdAt: at, undoneAt: at },
      ])
      .run();
    book.db
      .insert(bucketEvents)
      .values([
        {
          id: crypto.randomUUID(),
          kind: "fund",
          bucketId: food.id,
          otherBucketId: null,
          amount: 100,
          date: "2026-03-09",
          note: null,
          fundingRunId: activeRun,
          undoneAt: null,
        },
        {
          id: crypto.randomUUID(),
          kind: "fund",
          bucketId: food.id,
          otherBucketId: null,
          amount: 8_888,
          date: "2026-03-10",
          note: null,
          fundingRunId: undoneRun,
          undoneAt: null,
        },
      ])
      .run();

    expect(readBucket(book.db, food.id).balance).toBe(4_900 + 100);
  } finally {
    book.close();
  }
});

test("a refund increases the bucket balance", () => {
  const book = tempDatabase();
  try {
    const account = createAccount(book.db, {
      name: "Cash",
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const groceries = expense(book.db, "Groceries");
    const food = spending(book.db, "Groceries", [groceries.id]);
    purchase(book.db, account.id, groceries.id, -1_000);
    expect(readBucket(book.db, food.id).balance).toBe(-1_000);
    purchase(book.db, account.id, groceries.id, 250, "2026-03-02");
    expect(readBucket(book.db, food.id).balance).toBe(-750);
  } finally {
    book.close();
  }
});

test("a card purchase lowers the bucket and a card payment does not", () => {
  const book = tempDatabase();
  try {
    const card = createAccount(book.db, {
      name: "Card",
      kind: "credit_card",
      openingDate: "2026-01-01",
      openingBalance: 0,
      paymentPolicy: "manual",
      ...saved,
    });
    const cash = createAccount(book.db, {
      name: "Cash",
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const groceries = expense(book.db, "Groceries");
    const food = spending(book.db, "Groceries", [groceries.id]);
    purchase(book.db, card.id, groceries.id, -4_200);
    expect(readBucket(book.db, food.id).balance).toBe(-4_200);
    createTransaction(book.db, {
      accountId: cash.id,
      date: "2026-03-02",
      amount: -4_200,
      payeeRaw: "Card payment",
      status: "open",
      lines: [{ amount: -4_200, transferAccountId: card.id }],
      ...saved,
    });
    expect(readBucket(book.db, food.id).balance).toBe(-4_200);
  } finally {
    book.close();
  }
});

test("each expense category is in one bucket only", () => {
  const book = tempDatabase();
  try {
    const groceries = expense(book.db, "Groceries");
    const food = spending(book.db, "Groceries", [groceries.id]);
    expectCode(() => spending(book.db, "Other", [groceries.id]), "category_in_bucket");
    const other = spending(book.db, "Other", []);
    updateBucket(book.db, food.id, {
      name: food.name,
      kind: "spending",
      priority: 1,
      essential: false,
      color: "mint",
      icon: "shopping-cart",
      categoryIds: [],
      refillTo: 10_000,
      amount: null,
      dueDate: null,
      repeat: null,
      target: null,
      targetDate: null,
      fixedAmount: null,
      ...saved,
    });
    const moved = updateBucket(book.db, other.id, {
      name: other.name,
      kind: "spending",
      priority: 1,
      essential: false,
      color: "sky",
      icon: "shopping-cart",
      categoryIds: [groceries.id],
      refillTo: 10_000,
      amount: null,
      dueDate: null,
      repeat: null,
      target: null,
      targetDate: null,
      fixedAmount: null,
      ...saved,
    });
    expect(moved.categoryIds).toEqual([groceries.id]);
  } finally {
    book.close();
  }
});

test("only an expense category can be in a bucket", () => {
  const book = tempDatabase();
  try {
    const pay = createCategory(book.db, { name: "Pay", kind: "income", ...saved });
    expectCode(() => spending(book.db, "Pay", [pay.id]), "category_not_expense");
  } finally {
    book.close();
  }
});

test("undo of a move sets undoneAt and restores both balances", () => {
  const book = tempDatabase();
  try {
    const food = spending(book.db, "Groceries", []);
    const other = spending(book.db, "Other", []);
    createBucketEvent(book.db, food.id, { kind: "fund", amount: 5_000, date: "2026-03-01", ...saved });
    const move = createBucketEvent(book.db, food.id, {
      kind: "move",
      amount: 2_000,
      date: "2026-03-02",
      otherBucketId: other.id,
      ...saved,
    });
    expect(readBucket(book.db, food.id).balance).toBe(3_000);
    expect(readBucket(book.db, other.id).balance).toBe(2_000);
    const undone = undoBucketEvent(book.db, food.id, move.id, saved);
    expect(undone.undoneAt).toBe(at);
    const row = book.db.select().from(bucketEvents).where(eq(bucketEvents.id, move.id)).get();
    expect(row?.undoneAt).toBe(at);
    expect(readBucket(book.db, food.id).balance).toBe(5_000);
    expect(readBucket(book.db, other.id).balance).toBe(0);
    expectCode(() => undoBucketEvent(book.db, food.id, move.id, saved), "event_undone");
  } finally {
    book.close();
  }
});

test("cover moves the shortfall from another bucket", () => {
  const book = tempDatabase();
  try {
    const account = createAccount(book.db, {
      name: "Cash",
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const dining = expense(book.db, "Dining");
    const groceries = expense(book.db, "Groceries");
    const meals = spending(book.db, "Dining", [dining.id]);
    const food = spending(book.db, "Groceries", [groceries.id]);
    createBucketEvent(book.db, food.id, { kind: "fund", amount: 8_000, date: "2026-03-01", ...saved });
    purchase(book.db, account.id, dining.id, -4_200);
    const cover = coverBucket(book.db, meals.id, { fromBucketId: food.id, date: "2026-03-02", ...saved });
    expect(cover.kind).toBe("move");
    expect(cover.amount).toBe(4_200);
    expect(cover.bucketId).toBe(food.id);
    expect(cover.otherBucketId).toBe(meals.id);
    expect(readBucket(book.db, meals.id).balance).toBe(0);
    expect(readBucket(book.db, food.id).balance).toBe(3_800);
  } finally {
    book.close();
  }
});
