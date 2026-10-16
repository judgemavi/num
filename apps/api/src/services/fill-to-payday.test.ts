import { expect, test } from "bun:test";
import { bucketEvents } from "@num/db";
import { listBillNeeds } from "./bills";
import { saved } from "./bucket-test-book";
import { readBucket, updateBucket } from "./buckets";
import { createCategory } from "./categories";
import { fillBuckets } from "./funding-fill";
import { account, addSchedule, emergency, money, spend } from "./funding-test-book";
import { linkOccurrence } from "./recurring-links";
import { createSchedule } from "./schedule-test-book";
import { tempDatabase } from "./test-support";

/** The first paycheck is linked. The next one is October 15 and the schedule then ends. */
function paydayBook(unassigned: number) {
  const book = tempDatabase();
  const cash = account(book.db, "Cash", "chequing", unassigned - 1_000_000);
  const payCategory = createCategory(book.db, { name: "Pay", kind: "income", ...saved });
  const income = createSchedule(book.db, {
    name: "Paycheck", kind: "income", accountId: cash.id, categoryId: payCategory.id,
    expectedAmount: 1_000_000, amountMode: "fixed", tolerance: 0,
    startDate: "2026-10-01", endDate: "2026-10-15", freq: "weekly", interval: 2, businessDayShift: "none", ...saved,
  });
  const pay = money(book.db, cash.id, payCategory.id, "2026-10-01", 1_000_000, "Payroll");
  linkOccurrence(book.db, income.id, "2026-10-01", pay.id, saved);
  const rent = addSchedule(book.db, { name: "Rent", kind: "commitment", accountId: cash.id, expectedAmount: -1_500_000, startDate: "2026-10-01", freq: "monthly", interval: 1, monthDay: 1 });
  const phone = addSchedule(book.db, { name: "Phone", kind: "commitment", accountId: cash.id, expectedAmount: -100_000, startDate: "2026-10-28", freq: "monthly", interval: 1, monthDay: 28 });
  const food = spend(book.db, "Groceries", 600_000, { priority: 1, startDate: "2026-10-01" });
  const fund = emergency(book.db, 1, { priority: 2, startDate: "2026-10-01" });
  return { ...book, cash, payCategory, income, rent, phone, food, fund };
}

const fill = (book: ReturnType<typeof paydayBook>, asOf = "2026-10-01") => fillBuckets(book.db, { asOf, ...saved });

test("the bill cover and the fill agree before payday, and the next fill pays only what remains", () => {
  const book = paydayBook(1_700_000);
  try {
    const needs = listBillNeeds(book.db, "2026-10-01").items;
    expect(needs.find((item) => item.bucketId === book.rent.id)).toMatchObject({ covered: 1_500_000, short: 0 });
    expect(needs.find((item) => item.bucketId === book.phone.id)).toMatchObject({ covered: 0, short: 100_000 });
    expect(fill(book)).toEqual({ paid: 1_700_000, payments: 2 });
    expect(readBucket(book.db, book.food.id).balance).toBe(200_000);
    expect(readBucket(book.db, book.phone.id).balance).toBe(0);
    const events = book.db.select().from(bucketEvents).all();
    expect(fill(book)).toEqual({ paid: 0, payments: 0 });
    expect(book.db.select().from(bucketEvents).all()).toEqual(events);
    const pay = money(book.db, book.cash.id, book.payCategory.id, "2026-10-15", 1_000_000, "Payroll");
    linkOccurrence(book.db, book.income.id, "2026-10-15", pay.id, saved);
    expect(fill(book, "2026-10-16").paid).toBe(1_000_000);
    expect(readBucket(book.db, book.phone.id).balance).toBe(100_000);
    expect(readBucket(book.db, book.food.id).balance).toBe(600_000);
    expect(readBucket(book.db, book.fund.id).balance).toBe(500_000);
    expect(book.db.select().from(bucketEvents).all().every((event) => event.month === "2026-10" && event.date === "2026-10-01")).toBe(true);
  } finally {
    book.close();
  }
});

test("enough money pays all monthly amounts before the emergency bucket", () => {
  const book = paydayBook(2_500_000);
  try {
    expect(fill(book).paid).toBe(2_500_000);
    expect(readBucket(book.db, book.rent.id).balance).toBe(1_500_000);
    expect(readBucket(book.db, book.phone.id).balance).toBe(100_000);
    expect(readBucket(book.db, book.food.id).balance).toBe(600_000);
    expect(readBucket(book.db, book.fund.id).balance).toBe(300_000);
  } finally {
    book.close();
  }
});

test("the bill preview uses monthly amounts after negative balances are covered", () => {
  const book = paydayBook(2_000_000);
  try {
    const category = createCategory(book.db, { name: "Groceries", kind: "expense", ...saved });
    updateBucket(book.db, book.food.id, { categoryIds: [category.id], ...saved });
    money(book.db, book.cash.id, category.id, "2026-10-01", -300_000, "Market");
    // The cover lowers the monthly amount to 300 000. Its share to October 15 is 145 170.
    expect(listBillNeeds(book.db, "2026-10-01").items.find((item) => item.bucketId === book.phone.id)).toMatchObject({ covered: 54_830, short: 45_170 });
    expect(fill(book)).toEqual({ paid: 1_700_000, payments: 4 });
    expect(readBucket(book.db, book.phone.id).balance).toBe(54_830);
    expect(readBucket(book.db, book.food.id).balance).toBe(145_170);
  } finally {
    book.close();
  }
});
