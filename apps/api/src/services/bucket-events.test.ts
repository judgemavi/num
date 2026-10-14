import { bucketEvents, fundingRuns } from "@num/db";
import { eq } from "drizzle-orm";
import { expect, test } from "bun:test";
import { createAccount } from "./accounts";
import { coverBucket, createBucketEvent, undoBucketEvent } from "./bucket-events";
import { readBucket } from "./buckets";
import { createCategory } from "./categories";
import { tempDatabase, at, saved, expectCode, expense, spending, purchase } from "./bucket-test-book";

test("undo is rejected for a funding-run event", () => {
  const book = tempDatabase();
  try {
    const account = createAccount(book.db, {
      name: "Cash",
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const pay = createCategory(book.db, { name: "Pay", kind: "income", ...saved });
    const food = spending(book.db, "Groceries", []);
    const income = purchase(book.db, account.id, pay.id, 1_000);
    const runId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    book.db
      .insert(fundingRuns)
      .values({ id: runId, incomeTransactionId: income.id, date: "2026-03-01", createdAt: at, undoneAt: null })
      .run();
    book.db
      .insert(bucketEvents)
      .values({
        id: eventId,
        kind: "fund",
        bucketId: food.id,
        otherBucketId: null,
        amount: 1_000,
        date: "2026-03-01",
        note: null,
        fundingRunId: runId,
        undoneAt: null,
      })
      .run();
    expectCode(() => undoBucketEvent(book.db, food.id, eventId, saved), "event_funding_run");
    expect(book.db.select().from(bucketEvents).where(eq(bucketEvents.id, eventId)).get()?.undoneAt).toBeNull();
    expect(readBucket(book.db, food.id).balance).toBe(1_000);
  } finally {
    book.close();
  }
});

test("cover rejects the same bucket, a bucket that is not overspent, and a short source", () => {
  const book = tempDatabase();
  try {
    const account = createAccount(book.db, {
      name: "Cash",
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 200_000,
      ...saved,
    });
    const dining = expense(book.db, "Dining");
    const meals = spending(book.db, "Dining", [dining.id]);
    const food = spending(book.db, "Groceries", []);
    createBucketEvent(book.db, food.id, { kind: "fund", amount: 10_000, date: "2026-03-01", asOf: "2026-03-01", ...saved });
    expectCode(() => coverBucket(book.db, meals.id, { fromBucketId: meals.id, date: "2026-03-02", ...saved }), "bucket_same");
    expectCode(() => coverBucket(book.db, food.id, { fromBucketId: meals.id, date: "2026-03-02", ...saved }), "bucket_not_overspent");
    purchase(book.db, account.id, dining.id, -42_000);
    expectCode(() => coverBucket(book.db, meals.id, { fromBucketId: food.id, date: "2026-03-02", ...saved }), "bucket_short");
    expect(readBucket(book.db, meals.id).balance).toBe(-42_000);
    expect(readBucket(book.db, food.id).balance).toBe(10_000);
  } finally {
    book.close();
  }
});

test("undo of a move sets undoneAt and restores both balances", () => {
  const book = tempDatabase();
  try {
    createAccount(book.db, {
      name: "Cash",
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 100_000,
      ...saved,
    });
    const food = spending(book.db, "Groceries", []);
    const other = spending(book.db, "Other", []);
    createBucketEvent(book.db, food.id, { kind: "fund", amount: 50_000, date: "2026-03-01", asOf: "2026-03-01", ...saved });
    const move = createBucketEvent(book.db, food.id, {
      kind: "move",
      amount: 20_000,
      date: "2026-03-02",
      otherBucketId: other.id,
      ...saved,
    });
    expect(readBucket(book.db, food.id).balance).toBe(30_000);
    expect(readBucket(book.db, other.id).balance).toBe(20_000);
    const undone = undoBucketEvent(book.db, food.id, move.id, saved);
    expect(undone.undoneAt).toBe(at);
    const row = book.db.select().from(bucketEvents).where(eq(bucketEvents.id, move.id)).get();
    expect(row?.undoneAt).toBe(at);
    expect(readBucket(book.db, food.id).balance).toBe(50_000);
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
      openingBalance: 200_000,
      ...saved,
    });
    const dining = expense(book.db, "Dining");
    const groceries = expense(book.db, "Groceries");
    const meals = spending(book.db, "Dining", [dining.id]);
    const food = spending(book.db, "Groceries", [groceries.id]);
    createBucketEvent(book.db, food.id, { kind: "fund", amount: 80_000, date: "2026-03-01", asOf: "2026-03-01", ...saved });
    purchase(book.db, account.id, dining.id, -42_000);
    const cover = coverBucket(book.db, meals.id, { fromBucketId: food.id, date: "2026-03-02", ...saved });
    expect(cover.kind).toBe("move");
    expect(cover.amount).toBe(42_000);
    expect(cover.bucketId).toBe(food.id);
    expect(cover.otherBucketId).toBe(meals.id);
    expect(readBucket(book.db, meals.id).balance).toBe(0);
    expect(readBucket(book.db, food.id).balance).toBe(38_000);
  } finally {
    book.close();
  }
});
