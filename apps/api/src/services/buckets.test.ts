import { bucketCategories, bucketEvents } from "@num/db";
import { eq } from "drizzle-orm";
import { expect, test } from "bun:test";
import { createAccount } from "./accounts";
import { createBucketEvent, undoBucketEvent } from "./bucket-events";
import { archiveBucket, createBucket, readBucket, updateBucket } from "./buckets";
import { createCategory } from "./categories";
import { createTransaction, deleteTransaction } from "./transactions";
import { tempDatabase, at, saved, expectCode, expense, spending, purchase } from "./bucket-test-book";

test("bucket balance is funds, moves, releases and category lines", () => {
  const book = tempDatabase();
  try {
    const account = createAccount(book.db, {
      asOf: "2026-10-07",
      name: "Cash",
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 1_000_000,
      ...saved,
    });
    const groceries = expense(book.db, "Groceries");
    const food = spending(book.db, "Groceries", [groceries.id]);
    const other = spending(book.db, "Other", []);
    createBucketEvent(book.db, food.id, { kind: "fund", amount: 100_000, date: "2026-03-01", asOf: "2026-03-01", ...saved });
    createBucketEvent(book.db, food.id, {
      kind: "move",
      amount: 20_000,
      date: "2026-03-02",
      otherBucketId: other.id,
      ...saved,
    });
    createBucketEvent(book.db, other.id, {
      kind: "move",
      amount: 5_000,
      date: "2026-03-03",
      otherBucketId: food.id,
      ...saved,
    });
    createBucketEvent(book.db, food.id, { kind: "release", amount: 10_000, date: "2026-03-04", ...saved });
    purchase(book.db, account.id, groceries.id, -30_000, "2026-03-05");
    purchase(book.db, account.id, groceries.id, 4_000, "2026-03-06");
    const ignored = createBucketEvent(book.db, food.id, { kind: "fund", amount: 99_990, date: "2026-03-07", asOf: "2026-03-07", ...saved });
    undoBucketEvent(book.db, food.id, ignored.id, saved);
    const removed = purchase(book.db, account.id, groceries.id, -5_000, "2026-03-08");
    deleteTransaction(book.db, removed.id, saved);

    book.db
      .insert(bucketEvents)
      .values({
        id: crypto.randomUUID(),
        kind: "fund",
        bucketId: food.id,
        otherBucketId: null,
        amount: 1_000,
        date: "2026-03-09",
        month: "2026-03",
        undoneAt: null,
      })
      .run();

    expect(readBucket(book.db, food.id).balance).toBe(49_000 + 1_000);
  } finally {
    book.close();
  }
});

test("a card purchase lowers the bucket and a card payment does not", () => {
  const book = tempDatabase();
  try {
    const card = createAccount(book.db, {
      asOf: "2026-10-07",
      name: "Card",
      kind: "credit_card",
      openingDate: "2026-01-01",
      openingBalance: 0,
      paymentPolicy: "manual",
      ...saved,
    });
    const cash = createAccount(book.db, {
      asOf: "2026-10-07",
      name: "Cash",
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const groceries = expense(book.db, "Groceries");
    const food = spending(book.db, "Groceries", [groceries.id]);
    purchase(book.db, card.id, groceries.id, -42_000);
    expect(readBucket(book.db, food.id).balance).toBe(-42_000);
    createTransaction(book.db, {
      accountId: cash.id,
      date: "2026-03-02",
      amount: -42_000,
      payeeRaw: "Card payment",
      lines: [{ amount: -42_000, transferAccountId: card.id }],
      ...saved,
    });
    expect(readBucket(book.db, food.id).balance).toBe(-42_000);
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
      refillTo: 100_000,
      amount: null,
      dueDate: null,
      repeat: null,
      target: null,
      targetDate: null,
      fixedAmount: null,
      months: null,
      canRecede: null,
      schedule: null,
      startDate: "2000-01-01",
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
      refillTo: 100_000,
      amount: null,
      dueDate: null,
      repeat: null,
      target: null,
      targetDate: null,
      fixedAmount: null,
      months: null,
      canRecede: null,
      schedule: null,
      startDate: "2000-01-01",
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

test("archive needs a zero balance and removes category mappings", () => {
  const book = tempDatabase();
  try {
    createAccount(book.db, {
      asOf: "2026-10-07",
      name: "Cash",
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 10_000,
      ...saved,
    });
    const groceries = expense(book.db, "Groceries");
    const funded = spending(book.db, "Funded", []);
    createBucketEvent(book.db, funded.id, { kind: "fund", amount: 5_000, date: "2026-03-01", asOf: "2026-03-01", ...saved });
    expectCode(() => archiveBucket(book.db, funded.id, saved), "bucket_balance");
    expect(readBucket(book.db, funded.id).archivedAt).toBeNull();

    const empty = spending(book.db, "Empty", [groceries.id]);
    const archived = archiveBucket(book.db, empty.id, saved);
    expect(archived.archivedAt).toBe(at);
    expect(archived.categoryIds).toEqual([]);
    expect(book.db.select().from(bucketCategories).where(eq(bucketCategories.bucketId, empty.id)).all()).toEqual([]);
  } finally {
    book.close();
  }
});

test("kind fields that do not match the kind are rejected", () => {
  const book = tempDatabase();
  try {
    expectCode(
      () =>
        createBucket(book.db, {
          name: "Mixed",
          kind: "spending",
          priority: 1,
          essential: false,
          color: "sky",
          icon: "shopping-cart",
          categoryIds: [],
          refillTo: 1_000,
          amount: 500,
          dueDate: null,
          repeat: null,
          target: null,
          targetDate: null,
          fixedAmount: null,
          months: null,
          canRecede: null,
          schedule: null,
          asOf: "2000-01-01",
          ...saved,
        }),
      "bucket_fields_invalid",
    );
    expectCode(
      () =>
        createBucket(book.db, {
          name: "Both",
          kind: "goal",
          priority: 1,
          essential: null,
          color: "lilac",
          icon: "plane",
          categoryIds: [],
          refillTo: null,
          amount: null,
          dueDate: null,
          repeat: null,
          target: 1_000,
          targetDate: "2027-06-01",
          fixedAmount: 200,
          months: null,
          canRecede: true,
          schedule: null,
          asOf: "2000-01-01",
          ...saved,
        }),
      "bucket_fields_invalid",
    );
  } finally {
    book.close();
  }
});
