import { bucketEvents } from "@num/db";
import { expect, test } from "bun:test";
import { createBucketEvent, undoBucketEvent } from "./bucket-events";
import { expectCode, expense, saved, tempDatabase } from "./bucket-test-book";
import { readBucket } from "./buckets";
import { fillBuckets } from "./funding-fill";
import { fundingPosition } from "./funding-book";
import { readOwed } from "./funding-months";
import { readHygiene } from "./hygiene";
import { account, addSchedule, emergency, money, spend } from "./funding-test-book";

const october = { startDate: "2026-10-01" };

function fill(book: ReturnType<typeof tempDatabase>, asOf: string) {
  return fillBuckets(book.db, { asOf, ...saved });
}

function recedes(book: ReturnType<typeof tempDatabase>) {
  return book.db
    .select()
    .from(bucketEvents)
    .all()
    .filter((event) => event.kind === "recede")
    .map((event) => ({ bucketId: event.bucketId, otherBucketId: event.otherBucketId, amount: event.amount, date: event.date, month: event.month, undone: event.undoneAt !== null }));
}

/**
 * Cash 100 000 + `reserve`. Food (refill 100 000) is funded. The emergency fund has no target (no essential spending)
 * and gets `reserve` by hand, thus Unassigned is 0. A purchase of 130 000 makes Food 30 000 negative and Unassigned
 * −30 000.
 */
function poolBook(reserve: number) {
  const book = tempDatabase();
  const cash = account(book.db, "Cash", "chequing", 100_000 + reserve);
  const groceries = expense(book.db, "Groceries");
  const food = spend(book.db, "Food", 100_000, { priority: 1, categoryIds: [groceries.id], ...october });
  const fund = emergency(book.db, 3, { priority: 2, ...october });
  fill(book, "2026-10-08");
  createBucketEvent(book.db, fund.id, { kind: "fund", amount: reserve, date: "2026-10-08", asOf: "2026-10-08", ...saved });
  money(book.db, cash.id, groceries.id, "2026-10-20", -130_000, "Market");
  return { book, food, fund };
}

test("a cover that Unassigned cannot pay takes the missing part back from the emergency fund", () => {
  const { book, food, fund } = poolBook(50_000);
  try {
    expect(fundingPosition(book.db, "2026-10-21").unassigned).toBe(-30_000);
    fill(book, "2026-10-21");
    expect(recedes(book)).toEqual([{ bucketId: fund.id, otherBucketId: food.id, amount: 30_000, date: "2026-10-01", month: null, undone: false }]);
    expect(readBucket(book.db, food.id).balance).toBe(0);
    expect(readBucket(book.db, fund.id).balance).toBe(20_000);
    expect(fundingPosition(book.db, "2026-10-21").unassigned).toBe(0);
    expect(fill(book, "2026-10-22")).toEqual({ paid: 0, payments: 0 });
  } finally {
    book.close();
  }
});

test("a recede never makes the emergency balance negative", () => {
  const { book, food, fund } = poolBook(10_000);
  try {
    fill(book, "2026-10-21");
    expect(recedes(book)).toMatchObject([{ amount: 10_000 }]);
    expect(readBucket(book.db, fund.id).balance).toBe(0);
    expect(readBucket(book.db, food.id).balance).toBe(-20_000);
    expect(fill(book, "2026-10-22")).toEqual({ paid: 0, payments: 0 });
  } finally {
    book.close();
  }
});

test("an owed amount that Unassigned cannot pay does not take money from the emergency fund", () => {
  const { book, food, fund } = poolBook(50_000);
  try {
    fill(book, "2026-10-21");
    fill(book, "2026-11-02");
    expect(recedes(book)).toHaveLength(1);
    expect(readBucket(book.db, fund.id).balance).toBe(20_000);
    expect(readBucket(book.db, food.id).balance).toBe(0);
  } finally {
    book.close();
  }
});

test("a recede cannot be undone", () => {
  const { book, fund } = poolBook(50_000);
  try {
    fill(book, "2026-10-21");
    expect(recedes(book)).toMatchObject([{ amount: 30_000, undone: false }]);
    const [event] = book.db.select().from(bucketEvents).all().filter((item) => item.kind === "recede");
    expectCode(() => undoBucketEvent(book.db, fund.id, event?.id ?? "", saved), "event_recede");
  } finally {
    book.close();
  }
});

test("the savings used check fails in the month of a recede and shows each savings and covered bucket", () => {
  const { book, food, fund } = poolBook(50_000);
  try {
    const check = (asOf: string) => readHygiene(book.db, asOf).checks.find((item) => item.code === "savings_used");
    expect(check("2026-10-21")).toEqual({ code: "savings_used", pass: true, month: "2026-10", total: 0, items: [] });
    fill(book, "2026-10-21");
    expect(check("2026-10-21")).toEqual({
      code: "savings_used",
      pass: false,
      month: "2026-10",
      total: 30_000,
      items: [{ bucketId: fund.id, coveredId: food.id, amount: 30_000 }],
    });
    expect(check("2026-11-02")).toMatchObject({ pass: true, total: 0 });
  } finally {
    book.close();
  }
});

test("a loan payment by transfer to an account that is not on budget lowers the projected pool, a transfer between on-budget accounts does not", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 100_000);
    const savings = account(book.db, "Savings", "chequing", 0);
    const house = account(book.db, "House", "property", 0);
    const fund = emergency(book.db, 3, october);
    createBucketEvent(book.db, fund.id, { kind: "fund", amount: 20_000, date: "2026-10-08", asOf: "2026-10-08", ...saved });
    const monthly = { kind: "commitment" as const, accountId: cash.id, startDate: "2026-10-15", freq: "monthly" as const, interval: 1, monthDay: 15 };
    addSchedule(book.db, { ...monthly, name: "Loan", expectedAmount: -150_000, transferAccountId: house.id });
    addSchedule(book.db, { ...monthly, name: "To savings", expectedAmount: -500_000, transferAccountId: savings.id });
    // Unassigned 80 000. Three loan payments in 90 days: the lowest pool is 80 000 − 450 000 = −370 000.
    const check = readHygiene(book.db, "2026-10-08").checks.find((item) => item.code === "pool_short");
    expect(check).toEqual({
      code: "pool_short",
      pass: false,
      date: "2026-10-15",
      short: 370_000,
      pause: [],
      recede: [{ bucketId: fund.id, amount: 20_000 }],
      uncovered: 350_000,
    });
  } finally {
    book.close();
  }
});

test("a bucket that is negative at the start of the month is covered, then refilled to its level in one fill", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 500_000);
    const groceries = expense(book.db, "Groceries");
    const food = spend(book.db, "Food", 100_000, { categoryIds: [groceries.id], startDate: "2026-09-01" });
    fill(book, "2026-09-08");
    money(book.db, cash.id, groceries.id, "2026-09-20", -150_000, "Market");
    expect(readBucket(book.db, food.id).balance).toBe(-50_000);
    expect(fill(book, "2026-10-02")).toEqual({ paid: 100_000, payments: 2 });
    expect(readBucket(book.db, food.id).balance).toBe(100_000);
    expect(fill(book, "2026-10-03")).toEqual({ paid: 0, payments: 0 });
  } finally {
    book.close();
  }
});

test("after a recede, the emergency owed amount of the same fill uses the balance after the recede", () => {
  // Food (essential, refill 100 000) makes the target 100 000. Cash 150 000: Food gets 100 000 and the fund 50 000.
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 150_000);
    const groceries = expense(book.db, "Groceries");
    const food = spend(book.db, "Food", 100_000, { priority: 1, essential: true, categoryIds: [groceries.id], ...october });
    const fund = emergency(book.db, 1, { priority: 2, ...october });
    fill(book, "2026-10-08");
    expect(readBucket(book.db, fund.id).balance).toBe(50_000);
    money(book.db, cash.id, groceries.id, "2026-10-20", -130_000, "Market");
    expect(fill(book, "2026-10-21")).toEqual({ paid: 0, payments: 2 });
    expect(readBucket(book.db, food.id).balance).toBe(0);
    expect(readBucket(book.db, fund.id).balance).toBe(20_000);
    expect(readOwed(book.db, "2026-10-21").items.find((item) => item.bucketId === fund.id)).toMatchObject({ owed: 80_000 });
    expect(fill(book, "2026-10-22")).toEqual({ paid: 0, payments: 0 });
  } finally {
    book.close();
  }
});
