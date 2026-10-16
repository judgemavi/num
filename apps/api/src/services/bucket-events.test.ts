import { expectCode, tempDatabase } from "./test-support";
import { bucketEvents } from "@num/db";
import { eq } from "drizzle-orm";
import { expect, test } from "bun:test";
import { createAccount } from "./accounts";
import { createBucketEvent, undoBucketEvent } from "./bucket-events";
import { readBucket } from "./buckets";
import { at, saved, spending } from "./bucket-test-book";

test("undo is rejected for an event of the monthly fill", () => {
  const book = tempDatabase();
  try {
    const food = spending(book.db, "Groceries", []);
    const eventId = crypto.randomUUID();
    book.db
      .insert(bucketEvents)
      .values({
        id: eventId,
        kind: "fund",
        bucketId: food.id,
        otherBucketId: null,
        amount: 1_000,
        date: "2026-03-01",
        month: "2026-03",
        undoneAt: null,
      })
      .run();
    expectCode(() => undoBucketEvent(book.db, food.id, eventId, saved), "event_fill");
    expect(book.db.select().from(bucketEvents).where(eq(bucketEvents.id, eventId)).get()?.undoneAt).toBeNull();
    expect(readBucket(book.db, food.id).balance).toBe(1_000);
  } finally {
    book.close();
  }
});


test("undo of a move sets undoneAt and restores both balances", () => {
  const book = tempDatabase();
  try {
    createAccount(book.db, {
      asOf: "2026-10-07",
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
