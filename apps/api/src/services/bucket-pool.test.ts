import { auditLog, bucketEvents } from "@num/db";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { listBillNeeds } from "./bills";
import { pauseBucket, resumeBucket } from "./bucket-pause";
import { createBucketEvent } from "./bucket-events";
import { expectCode, expense, saved, tempDatabase } from "./bucket-test-book";
import { readBucket } from "./buckets";
import { fillBuckets } from "./funding-fill";
import { readOwed } from "./funding-months";
import { readHygiene } from "./hygiene";
import { account, addSchedule, goal, money, sinking, spend } from "./funding-test-book";

type Book = ReturnType<typeof tempDatabase>;

const october = { startDate: "2026-10-01" };
// The savings buckets start in November, thus the October fill does not fund them.
const later = { startDate: "2026-11-01" };

function fill(book: Book, asOf: string) {
  return fillBuckets(book.db, { asOf, ...saved });
}

function recedes(book: Book) {
  return book.db
    .select()
    .from(bucketEvents)
    .all()
    .filter((event) => event.kind === "recede")
    .map((event) => ({ bucketId: event.bucketId, otherBucketId: event.otherBucketId, amount: event.amount }));
}

function give(book: Book, bucketId: string, amount: number) {
  createBucketEvent(book.db, bucketId, { kind: "fund", amount, date: "2026-10-08", asOf: "2026-10-08", ...saved });
}

test("a cover takes money back from the savings buckets with canRecede, the lowest priority first, each down to 0", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 100_000 + 10_000 + 25_000 + 50_000);
    const groceries = expense(book.db, "Groceries");
    const food = spend(book.db, "Food", 100_000, { priority: 1, categoryIds: [groceries.id], ...october });
    const trip = goal(book.db, "Trip", 500_000, 10_000, { priority: 5, ...later });
    const house = goal(book.db, "House", 500_000, 10_000, { priority: 8, ...later });
    const car = sinking(book.db, "Car", 500_000, "2027-10-01", { priority: 9, ...later });
    fill(book, "2026-10-08");
    give(book, trip.id, 10_000);
    give(book, house.id, 25_000);
    give(book, car.id, 50_000);
    money(book.db, cash.id, groceries.id, "2026-10-20", -130_000, "Market");
    fill(book, "2026-10-21");
    expect(recedes(book)).toEqual([
      { bucketId: house.id, otherBucketId: food.id, amount: 25_000 },
      { bucketId: trip.id, otherBucketId: food.id, amount: 5_000 },
    ]);
    expect(readBucket(book.db, food.id).balance).toBe(0);
    expect(readBucket(book.db, house.id).balance).toBe(0);
    expect(readBucket(book.db, trip.id).balance).toBe(5_000);
    expect(readBucket(book.db, car.id).balance).toBe(50_000);
  } finally {
    book.close();
  }
});

test("a negative savings bucket is covered by a different savings bucket, not by itself", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 40_000);
    const travel = expense(book.db, "Travel");
    const trip = goal(book.db, "Trip", 500_000, 10_000, { priority: 5, categoryIds: [travel.id], ...october });
    const house = goal(book.db, "House", 500_000, 10_000, { priority: 8, ...october });
    give(book, trip.id, 10_000);
    give(book, house.id, 30_000);
    money(book.db, cash.id, travel.id, "2026-10-20", -25_000, "Airline");
    fill(book, "2026-10-21");
    expect(recedes(book)).toEqual([{ bucketId: house.id, otherBucketId: trip.id, amount: 15_000 }]);
    expect(readBucket(book.db, trip.id).balance).toBe(0);
    expect(readBucket(book.db, house.id).balance).toBe(15_000);
  } finally {
    book.close();
  }
});

test("a paused bucket has a monthly amount of 0, keeps its balance and can still give money back", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 500_000);
    const groceries = expense(book.db, "Groceries");
    const food = spend(book.db, "Food", 100_000, { categoryIds: [groceries.id], ...october });
    const trip = goal(book.db, "Trip", 500_000, 10_000, { priority: 5, ...october });
    fill(book, "2026-10-08");
    pauseBucket(book.db, food.id, saved);
    pauseBucket(book.db, trip.id, saved);
    money(book.db, cash.id, groceries.id, "2026-10-20", -40_000, "Market");
    expect(fill(book, "2026-11-02")).toEqual({ paid: 0, payments: 0 });
    expect(readOwed(book.db, "2026-11-02").items).toEqual([
      { bucketId: food.id, monthly: 0, owed: 0 },
      { bucketId: trip.id, monthly: 0, owed: 0 },
    ]);
    expect(readBucket(book.db, food.id)).toMatchObject({ balance: 60_000, pausedAt: saved.at });
    expect(readBucket(book.db, trip.id).balance).toBe(10_000);
    resumeBucket(book.db, food.id, saved);
    expect(fill(book, "2026-11-03")).toEqual({ paid: 40_000, payments: 1 });
  } finally {
    book.close();
  }
});

test("pause and resume are audited; an income, a paused bucket and an archived bucket cannot be paused", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 0);
    const food = spend(book.db, "Food", 100_000);
    const pay = addSchedule(book.db, { name: "Pay", kind: "income", accountId: cash.id, expectedAmount: 300_000, startDate: "2026-10-30", freq: "monthly", interval: 1 });
    pauseBucket(book.db, food.id, saved);
    expectCode(() => pauseBucket(book.db, food.id, saved), "bucket_paused");
    resumeBucket(book.db, food.id, saved);
    expectCode(() => resumeBucket(book.db, food.id, saved), "bucket_not_paused");
    expectCode(() => pauseBucket(book.db, pay.id, saved), "bucket_income_pause");
    const actions = book.db.select().from(auditLog).where(eq(auditLog.entityId, food.id)).all().map((row) => row.action);
    expect(actions).toEqual(["create", "pause", "resume"]);
  } finally {
    book.close();
  }
});

test("when the pool is short, the fill pays the bills in priority order and the lower bill is short", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 110_000);
    const monthly = { kind: "commitment" as const, accountId: cash.id, startDate: "2026-10-25", freq: "monthly" as const, interval: 1, monthDay: 25 };
    const gym = addSchedule(book.db, { ...monthly, name: "Gym", expectedAmount: -20_000, priority: 1 });
    const rent = addSchedule(book.db, { ...monthly, name: "Rent", expectedAmount: -100_000, priority: 0 });
    fill(book, "2026-10-08");
    expect(readBucket(book.db, rent.id).balance).toBe(100_000);
    expect(readBucket(book.db, gym.id).balance).toBe(10_000);
    expect(listBillNeeds(book.db, "2026-10-08").items).toEqual([
      { bucketId: rent.id, dueDate: "2026-10-25", amount: 100_000, short: 0 },
      { bucketId: gym.id, dueDate: "2026-10-25", amount: 20_000, short: 10_000 },
    ]);
    const check = readHygiene(book.db, "2026-10-08").checks.find((item) => item.code === "bills_short");
    expect(check).toEqual({ code: "bills_short", pass: false, items: [{ bucketId: gym.id, dueDate: "2026-10-25", short: 10_000 }] });
  } finally {
    book.close();
  }
});

test("a paused bill gets no money and shows its short amount", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 200_000);
    const gym = addSchedule(book.db, {
      name: "Gym",
      kind: "commitment",
      accountId: cash.id,
      expectedAmount: -20_000,
      startDate: "2026-10-25",
      freq: "monthly",
      interval: 1,
      monthDay: 25,
      essential: false,
    });
    pauseBucket(book.db, gym.id, saved);
    expect(fill(book, "2026-10-08")).toEqual({ paid: 0, payments: 0 });
    expect(listBillNeeds(book.db, "2026-10-08").items).toEqual([{ bucketId: gym.id, dueDate: "2026-10-25", amount: 20_000, short: 20_000 }]);
  } finally {
    book.close();
  }
});

test("the pool check suggests the non-essential spending first and lists the savings that would give money back", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 30_000);
    const eatOut = spend(book.db, "Eating out", 20_000, { priority: 3, ...october });
    const food = spend(book.db, "Food", 50_000, { priority: 1, essential: true, ...october });
    const trip = goal(book.db, "Trip", 500_000, 10_000, { priority: 5, ...october });
    give(book, trip.id, 30_000);
    const rent = { kind: "commitment" as const, accountId: cash.id, startDate: "2026-10-25", freq: "monthly" as const, interval: 1, monthDay: 25 };
    addSchedule(book.db, { ...rent, name: "Rent", expectedAmount: -50_000 });
    const check = readHygiene(book.db, "2026-10-08").checks.find((item) => item.code === "pool_short");
    // Unassigned 0. Three rent payments in 90 days: the pool goes to −150 000.
    expect(check).toEqual({
      code: "pool_short",
      pass: false,
      date: "2026-10-25",
      short: 150_000,
      pause: [
        { bucketId: eatOut.id, monthly: 20_000 },
        { bucketId: trip.id, monthly: 10_000 },
      ],
      recede: [{ bucketId: trip.id, amount: 30_000 }],
      uncovered: 120_000,
    });
    expect(readBucket(book.db, food.id).balance).toBe(0);
  } finally {
    book.close();
  }
});
