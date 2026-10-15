import { bucketEvents, buckets } from "@num/db";
import { expect, test } from "bun:test";
import { undoBucketEvent } from "./bucket-events";
import { expectCode, expense, saved, tempDatabase } from "./bucket-test-book";
import { readBucket, updateBucket } from "./buckets";
import { createCategory } from "./categories";
import { fillBuckets, fundMonthAgain } from "./funding-fill";
import { fundingPosition } from "./funding-book";
import { listMonthFunding, readOwed, undoMonthFunding } from "./funding-months";
import { account, money, spend } from "./funding-test-book";

const october = { startDate: "2026-10-01" };

function fill(book: ReturnType<typeof tempDatabase>, asOf: string) {
  return fillBuckets(book.db, { asOf, ...saved });
}

function funding(book: ReturnType<typeof tempDatabase>) {
  return book.db
    .select()
    .from(bucketEvents)
    .all()
    .filter((event) => event.kind === "fund")
    .sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0))
    .map((event) => ({ bucketId: event.bucketId, amount: event.amount, date: event.date, month: event.month, undone: event.undoneAt !== null }));
}

test("the fill pays the owed amounts in priority order and stops when Unassigned is used", () => {
  const book = tempDatabase();
  try {
    account(book.db, "Cash", "chequing", 120_000);
    const food = spend(book.db, "Food", 100_000, { priority: 1, ...october });
    const fuel = spend(book.db, "Fuel", 50_000, { priority: 2, ...october });
    const trip = spend(book.db, "Trip", 400_000, { priority: 3, ...october });
    expect(fill(book, "2026-10-08")).toEqual({ paid: 120_000, payments: 2 });
    expect(funding(book)).toEqual([
      { bucketId: food.id, amount: 100_000, date: "2026-10-01", month: "2026-10", undone: false },
      { bucketId: fuel.id, amount: 20_000, date: "2026-10-01", month: "2026-10", undone: false },
    ]);
    expect(fundingPosition(book.db, "2026-10-08").unassigned).toBe(0);
    expect(readOwed(book.db, "2026-10-08").items.filter((item) => item.monthly > 0).map((item) => [item.bucketId, item.monthly, item.owed])).toEqual([
      [food.id, 100_000, 0],
      [fuel.id, 50_000, 30_000],
      [trip.id, 400_000, 400_000],
    ]);
  } finally {
    book.close();
  }
});

test("more money later pays only what is still owed", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 120_000);
    const pay = createCategory(book.db, { name: "Pay", kind: "income", ...saved });
    const food = spend(book.db, "Food", 100_000, { priority: 1, ...october });
    const fuel = spend(book.db, "Fuel", 50_000, { priority: 2, ...october });
    fill(book, "2026-10-08");
    money(book.db, cash.id, pay.id, "2026-10-09", 500_000, "Payroll");
    expect(fill(book, "2026-10-10")).toEqual({ paid: 30_000, payments: 1 });
    expect(readBucket(book.db, food.id).balance).toBe(100_000);
    expect(readBucket(book.db, fuel.id).balance).toBe(50_000);
    expect(readOwed(book.db, "2026-10-10").items.every((item) => item.owed === 0)).toBe(true);
  } finally {
    book.close();
  }
});

test("the fill pays only the month of asOf and never a past month", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 500_000);
    const groceries = expense(book.db, "Groceries");
    const food = spend(book.db, "Food", 100_000, { startDate: "2026-08-01", categoryIds: [groceries.id] });
    const late = spend(book.db, "Late", 10_000, { priority: 2, startDate: "2026-10-01" });
    fill(book, "2026-10-08");
    expect(funding(book)).toEqual([
      { bucketId: food.id, amount: 100_000, date: "2026-10-01", month: "2026-10", undone: false },
      { bucketId: late.id, amount: 10_000, date: "2026-10-01", month: "2026-10", undone: false },
    ]);
    money(book.db, cash.id, groceries.id, "2026-10-15", -30_000, "Market");
    fill(book, "2026-11-02");
    expect(funding(book).slice(2)).toEqual([{ bucketId: food.id, amount: 30_000, date: "2026-11-01", month: "2026-11", undone: false }]);
  } finally {
    book.close();
  }
});

test("a change of the start date or the settings pays no back-pay", () => {
  const book = tempDatabase();
  try {
    account(book.db, "Cash", "chequing", 900_000);
    const food = spend(book.db, "Food", 100_000, october);
    fill(book, "2026-10-08");
    updateBucket(book.db, food.id, { startDate: "2026-07-01", refillTo: 150_000, ...saved });
    fill(book, "2026-10-09");
    expect(funding(book).map((event) => [event.month, event.amount])).toEqual([
      ["2026-10", 100_000],
      ["2026-10", 50_000],
    ]);
  } finally {
    book.close();
  }
});

test("the fill is idempotent", () => {
  const book = tempDatabase();
  try {
    account(book.db, "Cash", "chequing", 500_000);
    spend(book.db, "Food", 100_000, october);
    expect(fill(book, "2026-10-08").payments).toBe(1);
    const events = funding(book);
    const bucketCount = book.db.select().from(buckets).all().length;
    expect(fill(book, "2026-10-08")).toEqual({ paid: 0, payments: 0 });
    expect(fill(book, "2026-10-20")).toEqual({ paid: 0, payments: 0 });
    expect(funding(book)).toEqual(events);
    expect(book.db.select().from(buckets).all()).toHaveLength(bucketCount);
  } finally {
    book.close();
  }
});

function covers(book: ReturnType<typeof tempDatabase>) {
  return book.db
    .select()
    .from(bucketEvents)
    .all()
    .filter((event) => event.kind === "cover")
    .map((event) => ({ bucketId: event.bucketId, amount: event.amount, date: event.date, month: event.month, undone: event.undoneAt !== null }));
}

/** A cash account, a Food bucket (refill 100 000) that is funded, and a purchase of 130 000 that makes it 30 000 negative. */
function overspentBook(cashAmount = 500_000) {
  const book = tempDatabase();
  const cash = account(book.db, "Cash", "chequing", cashAmount);
  const groceries = expense(book.db, "Groceries");
  const food = spend(book.db, "Food", 100_000, { categoryIds: [groceries.id], ...october });
  fill(book, "2026-10-08");
  money(book.db, cash.id, groceries.id, "2026-10-20", -130_000, "Market");
  return { book, cash, groceries, food };
}

test("the fill covers a negative bucket back to 0 from Unassigned, and writes nothing more on a second run", () => {
  const { book, food } = overspentBook();
  try {
    expect(readBucket(book.db, food.id).balance).toBe(-30_000);
    fill(book, "2026-10-21");
    expect(covers(book)).toEqual([{ bucketId: food.id, amount: 30_000, date: "2026-10-01", month: null, undone: false }]);
    expect(readBucket(book.db, food.id).balance).toBe(0);
    expect(fill(book, "2026-10-22")).toEqual({ paid: 0, payments: 0 });
    expect(covers(book)).toHaveLength(1);
    expect(funding(book)).toHaveLength(1);
  } finally {
    book.close();
  }
});

test("a cover is not month funding: the next month refills to the level, not above it", () => {
  const { book, food } = overspentBook();
  try {
    fill(book, "2026-10-21");
    fill(book, "2026-11-02");
    expect(funding(book).at(-1)).toMatchObject({ bucketId: food.id, amount: 100_000, month: "2026-11" });
    expect(readBucket(book.db, food.id).balance).toBe(100_000);
  } finally {
    book.close();
  }
});

test("month undo leaves the covers, and an event of a cover cannot be undone alone", () => {
  const { book, food } = overspentBook();
  try {
    fill(book, "2026-10-21");
    undoMonthFunding(book.db, "2026-10", saved);
    expect(covers(book)).toMatchObject([{ amount: 30_000, undone: false }]);
    expect(readBucket(book.db, food.id).balance).toBe(-100_000);
    fill(book, "2026-10-22");
    expect(covers(book).reduce((sum, item) => sum + item.amount, 0)).toBe(130_000);
    expect(readBucket(book.db, food.id).balance).toBe(0);
    const [event] = book.db.select().from(bucketEvents).all().filter((item) => item.kind === "cover");
    expectCode(() => undoBucketEvent(book.db, food.id, event?.id ?? "", saved), "event_cover");
  } finally {
    book.close();
  }
});

test("the fill covers before it pays owed amounts, in priority order, and a partial cover goes to the first bucket", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 20_000);
    const first = expense(book.db, "First");
    const second = expense(book.db, "Second");
    const a = spend(book.db, "A", 100_000, { priority: 1, categoryIds: [first.id], ...october });
    const b = spend(book.db, "B", 100_000, { priority: 2, categoryIds: [second.id], ...october });
    money(book.db, cash.id, first.id, "2026-10-05", -30_000, "Shop");
    money(book.db, cash.id, second.id, "2026-10-05", -30_000, "Shop");
    // On-budget total -40 000: cash covers none of it. Unassigned is -40 000, thus 20 000 of 60 000 is covered.
    expect(fundingPosition(book.db, "2026-10-08").unassigned).toBe(-40_000);
    fill(book, "2026-10-08");
    expect(covers(book)).toEqual([{ bucketId: a.id, amount: 20_000, date: "2026-10-01", month: null, undone: false }]);
    expect(readBucket(book.db, a.id).balance).toBe(-10_000);
    expect(readBucket(book.db, b.id).balance).toBe(-30_000);
    expect(funding(book)).toEqual([]);
    expect(fill(book, "2026-10-09").payments).toBe(0);
    expect(covers(book)).toHaveLength(1);
  } finally {
    book.close();
  }
});

test("a cover comes first, then the owed amounts use the Unassigned that is left", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 500_000);
    const groceries = expense(book.db, "Groceries");
    spend(book.db, "Food", 0, { priority: 1, categoryIds: [groceries.id], ...october });
    const fuel = spend(book.db, "Fuel", 50_000, { priority: 2, ...october });
    money(book.db, cash.id, groceries.id, "2026-10-05", -30_000, "Shop");
    fill(book, "2026-10-08");
    expect(covers(book)).toHaveLength(1);
    expect(funding(book)).toMatchObject([{ bucketId: fuel.id, amount: 50_000 }]);
  } finally {
    book.close();
  }
});

test("undo of a month returns the money and holds the month until Fund again", () => {
  const book = tempDatabase();
  try {
    account(book.db, "Cash", "chequing", 500_000);
    const food = spend(book.db, "Food", 100_000, october);
    fill(book, "2026-10-08");
    expect(readBucket(book.db, food.id).balance).toBe(100_000);
    expect(undoMonthFunding(book.db, "2026-10", saved)).toEqual({ month: "2026-10", total: 0, held: true });
    expect(readBucket(book.db, food.id).balance).toBe(0);
    expect(listMonthFunding(book.db).items).toEqual([{ month: "2026-10", total: 0, held: true }]);
    expect(fill(book, "2026-10-09")).toEqual({ paid: 0, payments: 0 });
    expect(readBucket(book.db, food.id).balance).toBe(0);
    expectCode(() => undoMonthFunding(book.db, "2026-10", saved), "funding_month_held");

    expect(fundMonthAgain(book.db, "2026-10", { asOf: "2026-10-10", ...saved })).toEqual({ paid: 100_000, payments: 1 });
    expect(readBucket(book.db, food.id).balance).toBe(100_000);
    expect(listMonthFunding(book.db).items).toEqual([{ month: "2026-10", total: 100_000, held: false }]);
    expectCode(() => fundMonthAgain(book.db, "2026-10", { asOf: "2026-10-10", ...saved }), "funding_month_not_held");
  } finally {
    book.close();
  }
});

test("the next month does not repay a month that the user undid", () => {
  const book = tempDatabase();
  try {
    account(book.db, "Cash", "chequing", 500_000);
    const food = spend(book.db, "Food", 100_000, october);
    fill(book, "2026-10-08");
    undoMonthFunding(book.db, "2026-10", saved);
    fill(book, "2026-11-02");
    expect(readBucket(book.db, food.id).balance).toBe(100_000);
    expect(funding(book).map((event) => [event.month, event.undone])).toEqual([
      ["2026-10", true],
      ["2026-11", false],
    ]);
  } finally {
    book.close();
  }
});

test("a Fund again that pays nothing leaves no month to undo", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 100_000);
    const other = expense(book.db, "Other");
    spend(book.db, "Food", 100_000, october);
    fill(book, "2026-10-08");
    undoMonthFunding(book.db, "2026-10", saved);
    money(book.db, cash.id, other.id, "2026-10-09", -100_000, "Shop");
    expect(fundMonthAgain(book.db, "2026-10", { asOf: "2026-10-10", ...saved }).payments).toBe(0);
    expect(listMonthFunding(book.db).items).toEqual([]);
  } finally {
    book.close();
  }
});

test("a month without funding cannot be undone, and one event of the fill cannot be undone alone", () => {
  const book = tempDatabase();
  try {
    account(book.db, "Cash", "chequing", 500_000);
    const food = spend(book.db, "Food", 100_000, october);
    expectCode(() => undoMonthFunding(book.db, "2026-10", saved), "funding_month_not_found");
    fill(book, "2026-10-08");
    const [event] = book.db.select().from(bucketEvents).all();
    expectCode(() => undoBucketEvent(book.db, food.id, event?.id ?? "", saved), "event_month_funding");
  } finally {
    book.close();
  }
});
