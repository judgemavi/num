import { expectCode, tempDatabase } from "./test-support";
import { expect, test } from "bun:test";
import { createBucketEvent } from "./bucket-events";
import { saved } from "./bucket-test-book";
import { readBucket } from "./buckets";
import { createCategory } from "./categories";
import { positionOn } from "./funding-book";
import { account, addSchedule, money, spend } from "./funding-test-book";
import { createTransaction } from "./transactions";

test("a card purchase does not change Unassigned", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 200_000);
    const card = account(book.db, "Card", "credit_card", 0);
    account(book.db, "House", "property", 90_000_000);
    const groceries = createCategory(book.db, { name: "Groceries", kind: "expense", ...saved });
    const food = spend(book.db, "Food", 100_000, { categoryIds: [groceries.id] });
    createBucketEvent(book.db, food.id, { kind: "fund", amount: 50_000, date: "2026-10-01", asOf: "2026-10-01", ...saved });
    expect(positionOn(book.db, "2026-10-01").unassigned).toBe(150_000);
    money(book.db, card.id, groceries.id, "2026-10-02", -20_000, "Shop");
    const after = positionOn(book.db, "2026-10-02");
    expect(after.onBudgetTotal).toBe(180_000);
    expect(after.unassigned).toBe(150_000);
    createTransaction(book.db, {
      accountId: cash.id,
      date: "2026-10-03",
      amount: -20_000,
      payeeRaw: "Card payment",
      lines: [{ amount: -20_000, transferAccountId: card.id }],
      ...saved,
    });
    expect(positionOn(book.db, "2026-10-03").unassigned).toBe(150_000);
  } finally {
    book.close();
  }
});

test("a commitment lowers Unassigned only through its balance", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 100_000);
    const power = addSchedule(book.db, {
      name: "Power",
      kind: "commitment",
      accountId: cash.id,
      expectedAmount: -2_500,
      startDate: "2026-10-01",
      freq: "monthly",
      interval: 1,
      monthDay: 1,
    });
    expect(positionOn(book.db, "2026-10-01").unassigned).toBe(100_000);
    createBucketEvent(book.db, power.id, { kind: "fund", amount: 2_500, date: "2026-10-01", asOf: "2026-10-01", ...saved });
    expect(positionOn(book.db, "2026-10-01").unassigned).toBe(97_500);
  } finally {
    book.close();
  }
});

test("a fund over Unassigned and a release over the balance are rejected", () => {
  const book = tempDatabase();
  try {
    account(book.db, "Cash", "chequing", 10_000);
    const food = spend(book.db, "Food");
    const asOf = "2026-10-08";
    expectCode(
      () => createBucketEvent(book.db, food.id, { kind: "fund", amount: 10_010, date: asOf, asOf, ...saved }),
      "fund_over_unassigned",
    );
    createBucketEvent(book.db, food.id, { kind: "fund", amount: 10_000, date: asOf, asOf, ...saved });
    expectCode(
      () => createBucketEvent(book.db, food.id, { kind: "release", amount: 10_010, date: asOf, ...saved }),
      "release_over_balance",
    );
    createBucketEvent(book.db, food.id, { kind: "release", amount: 10_000, date: asOf, ...saved });
    expect(readBucket(book.db, food.id).balance).toBe(0);
  } finally {
    book.close();
  }
});
