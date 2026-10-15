import { bucketEvents } from "@num/db";
import { expect, test } from "bun:test";
import { createBucketEvent } from "./bucket-events";
import { expense, expectCode, saved, tempDatabase } from "./bucket-test-book";
import { archiveBucket, readBucket, updateBucket } from "./buckets";
import { readEmergencyFund } from "./emergency-fund";
import { createAccount } from "./accounts";
import { fillBuckets } from "./funding-fill";
import { readOwed } from "./funding-months";
import { createTransaction } from "./transactions";
import { account, addSchedule, emergency, money, spend } from "./funding-test-book";
import { linkOccurrence } from "./recurring-links";

const asOf = "2026-10-08";

/** A book with an essential spending bucket, an essential rent commitment and a cheque account. */
function essentialBook(openingBalance = 5_000_000) {
  const book = tempDatabase();
  const cash = account(book.db, "Cash", "chequing", openingBalance);
  const groceries = expense(book.db, "Groceries");
  const rent = expense(book.db, "Rent");
  const hobby = expense(book.db, "Hobby");
  const food = spend(book.db, "Food", 400_000, { essential: true, categoryIds: [groceries.id], startDate: "2026-10-01" });
  const bill = addSchedule(book.db, {
    name: "Rent",
    kind: "commitment",
    accountId: cash.id,
    expectedAmount: -1_000_000,
    startDate: "2026-01-15",
    freq: "monthly",
    interval: 1,
    monthDay: 15,
    categoryId: rent.id,
  });
  return { ...book, cash, groceries, rent, hobby, food, bill };
}

function spendIn(book: ReturnType<typeof essentialBook>, month: string, groceries: number, rent: number, hobby = 0) {
  money(book.db, book.cash.id, book.groceries.id, `${month}-05`, -groceries, "Market");
  const payment = money(book.db, book.cash.id, book.rent.id, `${month}-15`, -rent, "Landlord");
  linkOccurrence(book.db, book.bill.id, `${month}-15`, payment.id, saved);
  if (hobby > 0) {
    money(book.db, book.cash.id, book.hobby.id, `${month}-20`, -hobby, "Shop");
  }
}

test("the monthly essential spending is the median of the last 6 complete months", () => {
  const book = essentialBook();
  try {
    const fund = emergency(book.db, 3);
    // March is outside the 6 months. Hobby is not an essential category. October is not complete. The rent counts as a linked payment.
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
      monthly: 1_325_000,
      target: 3 * 1_325_000,
      basis: "history",
    });
  } finally {
    book.close();
  }
});

test("with fewer than 3 complete months the monthly figure is the plan: essential commitments (yearly / 12) plus essential refills", () => {
  const book = essentialBook();
  try {
    emergency(book.db, 2);
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

test("a payment is counted one time, a non-essential commitment is not counted, a transfer payment counts in full", () => {
  const book = essentialBook();
  try {
    emergency(book.db, 1);
    const stream = addSchedule(book.db, {
      name: "Streaming",
      kind: "commitment",
      accountId: book.cash.id,
      expectedAmount: -20_000,
      startDate: "2026-01-10",
      freq: "monthly",
      interval: 1,
      monthDay: 10,
      essential: false,
    });
    const loan = createAccount(book.db, { name: "Loan", kind: "mortgage", openingDate: "2026-01-01", openingBalance: 0, paymentPolicy: null, ...saved });
    const mortgage = addSchedule(book.db, {
      name: "Mortgage",
      kind: "commitment",
      accountId: book.cash.id,
      transferAccountId: loan.id,
      expectedAmount: -500_000,
      startDate: "2026-01-20",
      freq: "monthly",
      interval: 1,
      monthDay: 20,
    });
    for (const month of ["2026-04", "2026-05", "2026-06"]) {
      // The groceries bucket is essential. The linked streaming payment is not essential and does not count there.
      const streamPayment = money(book.db, book.cash.id, book.groceries.id, `${month}-10`, -20_000, "Stream");
      linkOccurrence(book.db, stream.id, `${month}-10`, streamPayment.id, saved);
      money(book.db, book.cash.id, book.groceries.id, `${month}-05`, -100_000, "Market");
      // The rent payment has a groceries category: it counts one time, as a linked payment.
      const rentPayment = money(book.db, book.cash.id, book.groceries.id, `${month}-15`, -1_000_000, "Landlord");
      linkOccurrence(book.db, book.bill.id, `${month}-15`, rentPayment.id, saved);
      const loanPayment = createTransaction(book.db, {
        accountId: book.cash.id,
        date: `${month}-20`,
        amount: -500_000,
        payeeRaw: "Bank",
        lines: [
          { amount: -400_000, transferAccountId: loan.id },
          { amount: -100_000, categoryId: book.rent.id },
        ],
        ...saved,
      });
      linkOccurrence(book.db, mortgage.id, `${month}-20`, loanPayment.id, saved);
    }
    expect(readEmergencyFund(book.db, asOf)).toMatchObject({ monthly: 1_600_000, basis: "history" });
  } finally {
    book.close();
  }
});

test("the emergency bucket takes the free pool up to its target, and a bucket after it gets the rest", () => {
  // Rent takes 1 000 000. The target is the plan: rent 1 000 000 a month. 3 000 000 is left for Trip.
  const book = essentialBook(5_000_000);
  try {
    updateBucket(book.db, book.food.id, { refillTo: 0, ...saved });
    const fund = emergency(book.db, 1, { priority: 2, startDate: "2026-10-01" });
    const trip = spend(book.db, "Trip", 4_000_000, { priority: 3, startDate: "2026-10-01" });
    fill(book, "2026-10-08");
    expect(fundedBy(book, fund.id)).toEqual([1_000_000]);
    expect(fundedBy(book, trip.id)).toEqual([3_000_000]);
    expect(readOwed(book.db, "2026-10-08").items.find((item) => item.bucketId === fund.id)).toEqual({ bucketId: fund.id, monthly: 1_000_000, owed: 0 });
  } finally {
    book.close();
  }
});

test("the owed amount is the target minus the balance on asOf, thus a release is paid back in the same month", () => {
  const book = essentialBook();
  try {
    updateBucket(book.db, book.food.id, { refillTo: 0, ...saved });
    const fund = emergency(book.db, 1, { startDate: "2026-10-01" });
    fill(book, "2026-10-08");
    createBucketEvent(book.db, fund.id, { kind: "release", amount: 400_000, date: "2026-10-10", ...saved });
    const owed = readOwed(book.db, "2026-10-12").items.find((item) => item.bucketId === fund.id);
    expect(owed).toEqual({ bucketId: fund.id, monthly: 1_400_000, owed: 400_000 });
    expect(readEmergencyFund(book.db, "2026-10-12")).toMatchObject({ balance: 600_000, target: 1_000_000 });
    fill(book, "2026-10-12");
    expect(fundedBy(book, fund.id)).toEqual([1_000_000, 400_000]);
    expect(readBucket(book.db, fund.id).balance).toBe(1_000_000);
  } finally {
    book.close();
  }
});

test("the emergency bucket is funded after the spending buckets and before the goals", () => {
  // The rent commitment is first and takes 1 000 000. 450 000 is left: Food takes 400 000, and the emergency bucket gets the rest.
  const book = essentialBook(1_450_000);
  try {
    const fund = emergency(book.db, 1, { priority: 2, startDate: "2026-10-01" });
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
    const fund = emergency(book.db, 3);
    expectCode(() => emergency(book.db, 3), "bucket_emergency_exists");
    archiveBucket(book.db, fund.id, saved);
    expectCode(() => emergency(book.db, 3), "bucket_emergency_exists");
    expectCode(() => updateBucket(book.db, fund.id, { categoryIds: [book.hobby.id], ...saved }), "invalid_body");
    expectCode(() => updateBucket(book.db, book.food.id, { kind: "emergency", months: 3, refillTo: null, categoryIds: [], ...saved }), "bucket_fields_invalid");
  } finally {
    book.close();
  }
});
