import { bucketEvents } from "@num/db";
import { expect, test } from "bun:test";
import { createBucketEvent } from "./bucket-events";
import { expense, expectCode, saved, tempDatabase } from "./bucket-test-book";
import { archiveBucket, readBucket, updateBucket } from "./buckets";
import { readEmergencyFund } from "./emergency-fund";
import { fillBuckets } from "./funding-fill";
import { account, emergency, money, plan, spend } from "./funding-test-book";

const asOf = "2026-10-08";

/** A book with an essential spending bucket, a rent bill and a cheque account. */
function essentialBook(openingBalance = 5_000_000) {
  const book = tempDatabase();
  const cash = account(book.db, "Cash", "chequing", openingBalance);
  const groceries = expense(book.db, "Groceries");
  const rent = expense(book.db, "Rent");
  const hobby = expense(book.db, "Hobby");
  const food = spend(book.db, "Food", 400_000, { essential: true, categoryIds: [groceries.id], startDate: "2026-10-01" });
  const bill = plan(book.db, {
    name: "Rent",
    kind: "bill",
    accountId: cash.id,
    expectedAmount: -1_000_000,
    startDate: "2026-01-15",
    freq: "monthly",
    interval: 1,
    monthDay: 15,
    categoryId: rent.id,
    fundsBuckets: false,
  });
  return { ...book, cash, groceries, rent, hobby, food, bill };
}

function spendIn(book: ReturnType<typeof essentialBook>, month: string, groceries: number, rent: number, hobby = 0) {
  money(book.db, book.cash.id, book.groceries.id, `${month}-05`, -groceries, "Market");
  money(book.db, book.cash.id, book.rent.id, `${month}-15`, -rent, "Landlord");
  if (hobby > 0) {
    money(book.db, book.cash.id, book.hobby.id, `${month}-20`, -hobby, "Shop");
  }
}

test("the monthly essential spending is the median of the last 6 complete months", () => {
  const book = essentialBook();
  try {
    const fund = emergency(book.db, 3, 12);
    // March is outside the 6 months. Hobby is not an essential category. October is not complete.
    spendIn(book, "2026-03", 9_999_000, 1_000_000);
    ["300", "310", "320", "330", "340", "350"].forEach((groceries, index) => {
      spendIn(book, `2026-0${index + 4}`, Number(groceries) * 1000, 1_000_000, 777_000);
    });
    spendIn(book, "2026-10", 5_000_000, 1_000_000);
    expect(readEmergencyFund(book.db, asOf)).toEqual({
      bucketId: fund.id,
      archived: false,
      balance: 0,
      months: 3,
      fillMonths: 12,
      monthly: 1_325_000,
      target: 3 * 1_325_000,
      basis: "history",
    });
  } finally {
    book.close();
  }
});

test("with fewer than 3 complete months the monthly figure is the plan: bills plus essential refills", () => {
  const book = essentialBook();
  try {
    emergency(book.db, 2, 12);
    spendIn(book, "2026-08", 100_000, 1_000_000);
    spendIn(book, "2026-09", 100_000, 1_000_000);
    expect(readEmergencyFund(book.db, asOf)).toMatchObject({ monthly: 1_400_000, target: 2_800_000, basis: "plan" });
  } finally {
    book.close();
  }
});

/** The monthly figure is 1 000 000 (the rent). The target for one month is 1 000 000, spread over 12 months. */
function fundedBy(book: ReturnType<typeof essentialBook>, bucketId: string) {
  return book.db
    .select()
    .from(bucketEvents)
    .all()
    .filter((event) => event.bucketId === bucketId && event.kind === "fund")
    .sort((left, right) => (left.date < right.date ? -1 : 1))
    .map((event) => event.amount);
}

function fill(book: ReturnType<typeof essentialBook>, day: string) {
  return fillBuckets(book.db, { asOf: day, ...saved });
}

test("each month funds the rate: the target over the fill months", () => {
  const book = essentialBook();
  try {
    updateBucket(book.db, book.food.id, { refillTo: 0, ...saved });
    const fund = emergency(book.db, 1, 12, { startDate: "2026-10-01" });
    fill(book, "2026-10-08");
    // 1 000 000 / 12, rounded up to a cent, is 83 340.
    expect(fundedBy(book, fund.id)).toEqual([83_340]);
  } finally {
    book.close();
  }
});

test("the amount is capped at the shortfall, and the bucket refills at the rate after a release", () => {
  const book = essentialBook();
  try {
    updateBucket(book.db, book.food.id, { refillTo: 0, ...saved });
    const fund = emergency(book.db, 1, 12, { startDate: "2026-10-01" });
    createBucketEvent(book.db, fund.id, { kind: "fund", amount: 960_000, date: "2026-09-30", asOf: "2026-09-30", ...saved });
    fill(book, "2026-11-05");
    expect(fundedBy(book, fund.id)).toEqual([960_000, 40_000]);
    expect(readBucket(book.db, fund.id).balance).toBe(1_000_000);

    createBucketEvent(book.db, fund.id, { kind: "release", amount: 500_000, date: "2026-11-10", ...saved });
    fill(book, "2026-12-05");
    expect(fundedBy(book, fund.id)).toEqual([960_000, 40_000, 83_340]);
  } finally {
    book.close();
  }
});

test("the emergency bucket is funded after the spending buckets and before the goals", () => {
  // The rent of 1 000 000 is reserved. 450 000 is free: Food takes 400 000, and the emergency bucket gets the rest.
  const book = essentialBook(1_450_000);
  try {
    const fund = emergency(book.db, 1, 12, { priority: 2, startDate: "2026-10-01" });
    fill(book, "2026-10-08");
    expect(fundedBy(book, book.food.id)).toEqual([400_000]);
    expect(fundedBy(book, fund.id)).toEqual([50_000]);
  } finally {
    book.close();
  }
});

test("a book has one emergency bucket, with no categories, and the kind does not change", () => {
  const book = essentialBook();
  try {
    const fund = emergency(book.db, 3, 12);
    expectCode(() => emergency(book.db, 3, 12), "bucket_emergency_exists");
    archiveBucket(book.db, fund.id, saved);
    expectCode(() => emergency(book.db, 3, 12), "bucket_emergency_exists");
    expectCode(() => updateBucket(book.db, fund.id, { categoryIds: [book.hobby.id], ...saved }), "invalid_body");
    expectCode(() => updateBucket(book.db, book.food.id, { kind: "emergency", months: 3, fillMonths: 12, refillTo: null, categoryIds: [], ...saved }), "bucket_fields_invalid");
  } finally {
    book.close();
  }
});
