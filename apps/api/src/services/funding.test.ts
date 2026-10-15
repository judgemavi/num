import { expect, test } from "bun:test";
import { createBucketEvent } from "./bucket-events";
import { expectCode, saved, tempDatabase } from "./bucket-test-book";
import { readBucket } from "./buckets";
import { createCategory } from "./categories";
import { fundingPosition } from "./funding-book";
import { account, money, plan, spend } from "./funding-test-book";
import { linkOccurrence } from "./recurring-links";
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
    expect(fundingPosition(book.db, "2026-10-01").unassigned).toBe(150_000);
    money(book.db, card.id, groceries.id, "2026-10-02", -20_000, "Shop");
    const after = fundingPosition(book.db, "2026-10-02");
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
    expect(fundingPosition(book.db, "2026-10-03").unassigned).toBe(150_000);
  } finally {
    book.close();
  }
});

test("bills are reserved on payday", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 100_000);
    plan(book.db, {
      name: "Pay",
      kind: "income",
      accountId: cash.id,
      expectedAmount: 200_000,
      startDate: "2026-10-01",
      freq: "weekly",
      interval: 2,
      fundsBuckets: true,
    });
    plan(book.db, {
      name: "Power",
      kind: "bill",
      accountId: cash.id,
      expectedAmount: -2_500,
      startDate: "2026-10-01",
      freq: "monthly",
      interval: 1,
      monthDay: 1,
      fundsBuckets: false,
    });
    plan(book.db, {
      name: "Rent",
      kind: "bill",
      accountId: cash.id,
      expectedAmount: -9_990,
      startDate: "2026-10-15",
      freq: "monthly",
      interval: 1,
      monthDay: 15,
      fundsBuckets: false,
    });
    const reserved = fundingPosition(book.db, "2026-10-01");
    expect(reserved.nextIncomeDate).toBe("2026-10-15");
    expect(reserved.billsReserved).toBe(2_500);
  } finally {
    book.close();
  }
});

test("a variable bill reserves the safe amount", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 100_000);
    const power = createCategory(book.db, { name: "Power", kind: "expense", ...saved });
    plan(book.db, {
      name: "Pay",
      kind: "income",
      accountId: cash.id,
      expectedAmount: 200_000,
      startDate: "2026-10-01",
      freq: "weekly",
      interval: 2,
      fundsBuckets: true,
    });
    const bill = plan(book.db, {
      name: "Power",
      kind: "bill",
      accountId: cash.id,
      expectedAmount: -10_000,
      amountMode: "variable",
      startDate: "2026-07-12",
      freq: "monthly",
      interval: 1,
      monthDay: 12,
      fundsBuckets: false,
    });
    for (const [date, amount] of [
      ["2026-07-12", -1_000],
      ["2026-08-12", -2_500],
      ["2026-09-12", -9_000],
    ] as const) {
      const paid = money(book.db, cash.id, power.id, date, amount, "Power Co");
      linkOccurrence(book.db, bill.id, date, paid.id, saved);
    }
    expect(fundingPosition(book.db, "2026-10-08").billsReserved).toBe(9_000);
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
