import { expect, test } from "bun:test";
import { createBucketEvent } from "./bucket-events";
import { expectCode, saved, tempDatabase } from "./bucket-test-book";
import { archiveBucket, listBuckets, readBucket } from "./buckets";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { monthlyRows } from "./funding-months";
import { account, addSchedule, emergency, money, spend } from "./funding-test-book";
import { linkOccurrence, skipOccurrence, unlinkOccurrence } from "./recurring-links";
import { createTransaction } from "./transactions";

test("a commitment balance is its events plus the full amount of the linked payments on or after its start date", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 1_000_000);
    const rent = createCategory(book.db, { name: "Rent", kind: "expense", ...saved });
    const commitment = addSchedule(book.db, {
      name: "Rent",
      kind: "commitment",
      accountId: cash.id,
      expectedAmount: -100_000,
      startDate: "2026-01-15",
      bucketStartDate: "2026-02-01",
      freq: "monthly",
      interval: 1,
      monthDay: 15,
    });
    createBucketEvent(book.db, commitment.id, { kind: "fund", amount: 300_000, date: "2026-02-01", asOf: "2026-02-01", ...saved });
    for (const date of ["2026-01-15", "2026-02-15", "2026-03-15"]) {
      const paid = money(book.db, cash.id, rent.id, date, -100_000, "Landlord");
      linkOccurrence(book.db, commitment.id, date, paid.id, saved);
    }
    // The payment of January is before the start date. February and March count.
    expect(readBucket(book.db, commitment.id).balance).toBe(100_000);
  } finally {
    book.close();
  }
});

test("a loan payment counts with its full amount, the interest line included", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 1_000_000);
    const loan = createAccount(book.db, { name: "Loan", kind: "mortgage", openingDate: "2026-01-01", openingBalance: 0, paymentPolicy: null, ...saved });
    const interest = createCategory(book.db, { name: "Interest", kind: "expense", ...saved });
    const commitment = addSchedule(book.db, {
      name: "Mortgage",
      kind: "commitment",
      accountId: cash.id,
      transferAccountId: loan.id,
      expectedAmount: -500_000,
      startDate: "2026-02-20",
      freq: "monthly",
      interval: 1,
      monthDay: 20,
    });
    const payment = createTransaction(book.db, {
      accountId: cash.id,
      date: "2026-02-20",
      amount: -500_000,
      payeeRaw: "Bank",
      lines: [
        { amount: -400_000, transferAccountId: loan.id },
        { amount: -100_000, categoryId: interest.id },
      ],
      ...saved,
    });
    linkOccurrence(book.db, commitment.id, "2026-02-20", payment.id, saved);
    expect(readBucket(book.db, commitment.id).balance).toBe(-500_000);
  } finally {
    book.close();
  }
});

test("a payment linked to a commitment does not count in a category bucket", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 1_000_000);
    const groceries = createCategory(book.db, { name: "Groceries", kind: "expense", ...saved });
    const food = spend(book.db, "Food", 100_000, { categoryIds: [groceries.id] });
    const commitment = addSchedule(book.db, {
      name: "Meal box",
      kind: "commitment",
      accountId: cash.id,
      expectedAmount: -20_000,
      startDate: "2026-03-10",
      freq: "monthly",
      interval: 1,
      monthDay: 10,
    });
    money(book.db, cash.id, groceries.id, "2026-03-05", -5_000, "Market");
    const box = money(book.db, cash.id, groceries.id, "2026-03-10", -20_000, "Meal box");
    expect(readBucket(book.db, food.id).balance).toBe(-25_000);
    linkOccurrence(book.db, commitment.id, "2026-03-10", box.id, saved);
    expect(readBucket(book.db, food.id).balance).toBe(-5_000);
    expect(readBucket(book.db, commitment.id).balance).toBe(-20_000);
    unlinkOccurrence(book.db, commitment.id, "2026-03-10", saved);
    expect(readBucket(book.db, food.id).balance).toBe(-25_000);
  } finally {
    book.close();
  }
});

test("an income has no balance and no events, and it is not in the monthly amounts", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 100_000);
    const pay = addSchedule(book.db, {
      name: "Pay",
      kind: "income",
      accountId: cash.id,
      expectedAmount: 200_000,
      startDate: "2026-10-01",
      freq: "monthly",
      interval: 1,
      monthDay: 1,
    });
    const paid = money(book.db, cash.id, createCategory(book.db, { name: "Salary", kind: "income", ...saved }).id, "2026-10-01", 200_000, "Employer");
    linkOccurrence(book.db, pay.id, "2026-10-01", paid.id, saved);
    expect(readBucket(book.db, pay.id).balance).toBe(0);
    expectCode(() => createBucketEvent(book.db, pay.id, { kind: "fund", amount: 1_000, date: "2026-10-02", asOf: "2026-10-02", ...saved }), "bucket_fields_invalid");
    expect(monthlyRows(book.db, "2026-10").map((row) => row.bucket.id)).toEqual([]);
    expect(archiveBucket(book.db, pay.id, saved).archivedAt).not.toBeNull();
  } finally {
    book.close();
  }
});

test("the monthly amount of a commitment skips skipped occurrences and uses the safe amount of a variable one", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 1_000_000);
    const power = createCategory(book.db, { name: "Power", kind: "expense", ...saved });
    const weekly = addSchedule(book.db, {
      name: "Gym",
      kind: "commitment",
      accountId: cash.id,
      expectedAmount: -10_000,
      startDate: "2026-01-02",
      freq: "weekly",
      interval: 1,
    });
    skipOccurrence(book.db, weekly.id, "2026-10-09", "Closed", saved);
    const variable = addSchedule(book.db, {
      name: "Power",
      kind: "commitment",
      accountId: cash.id,
      expectedAmount: -10_000,
      amountMode: "variable",
      startDate: "2026-06-12",
      freq: "monthly",
      interval: 1,
      monthDay: 12,
    });
    for (const [date, amount] of [
      ["2026-07-12", -1_000],
      ["2026-08-12", -2_500],
      ["2026-09-12", -9_000],
    ] as const) {
      const paid = money(book.db, cash.id, power.id, date, amount, "Power Co");
      linkOccurrence(book.db, variable.id, date, paid.id, saved);
    }
    // The payments took 12 500 from the bucket. A fund of 12 500 brings the balance back to 0.
    createBucketEvent(book.db, variable.id, { kind: "fund", amount: 12_500, date: "2026-09-30", asOf: "2026-09-30", ...saved });
    const amounts = new Map(monthlyRows(book.db, "2026-10").map((row) => [row.bucket.id, row.monthly]));
    // Gym: five Fridays in October minus the skipped one. Power: the largest of the last payments, once.
    expect(amounts.get(weekly.id)).toBe(40_000);
    expect(amounts.get(variable.id)).toBe(9_000);
  } finally {
    book.close();
  }
});

test("rent that is due on the 1st and was paid on the 30th is not asked for again in the new month", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 1_000_000);
    const rent = createCategory(book.db, { name: "Rent", kind: "expense", ...saved });
    const commitment = addSchedule(book.db, {
      name: "Rent",
      kind: "commitment",
      accountId: cash.id,
      expectedAmount: -100_000,
      startDate: "2026-01-01",
      freq: "monthly",
      interval: 1,
      monthDay: 1,
    });
    createBucketEvent(book.db, commitment.id, { kind: "fund", amount: 100_000, date: "2026-09-01", asOf: "2026-09-01", ...saved });
    const paid = money(book.db, cash.id, rent.id, "2026-09-30", -100_000, "Landlord");
    linkOccurrence(book.db, commitment.id, "2026-10-01", paid.id, saved);
    const amount = (month: string) => monthlyRows(book.db, month).find((row) => row.bucket.id === commitment.id)?.monthly;
    expect(amount("2026-10")).toBe(0);
    expect(amount("2026-11")).toBe(100_000);
  } finally {
    book.close();
  }
});

test("buckets with the same priority are in the order: commitment first, then the id", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 1_000_000);
    const fund = emergency(book.db, 1, 12, { priority: 0, startDate: "2026-10-01" });
    const rent = addSchedule(book.db, {
      name: "Rent",
      kind: "commitment",
      accountId: cash.id,
      expectedAmount: -100_000,
      startDate: "2026-10-01",
      freq: "monthly",
      interval: 1,
      monthDay: 1,
    });
    expect(monthlyRows(book.db, "2026-10").map((row) => row.bucket.id)).toEqual([rent.id, fund.id]);
    const listed = listBuckets(book.db, { archived: false, sort: "priority", dir: "asc", page: 1, pageSize: 50 });
    expect(listed.items.map((item) => item.id)).toEqual([rent.id, fund.id]);
  } finally {
    book.close();
  }
});
