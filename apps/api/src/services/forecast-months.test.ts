import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings } from "@num/db";
import type { PlanCreate } from "@num/shared";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createBucket } from "./buckets";
import { createCategory } from "./categories";
import { readForecast } from "./forecast";
import { linkOccurrence } from "./recurring-links";
import { createPlan } from "./recurring-plans";
import { createTransaction } from "./transactions";

const saved = { source: "ui" as const, at: "2026-10-01T16:00:00Z" };

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-forecast-months-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "CAD" }).run();
  return {
    db,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function record(db: Db, accountId: string, date: string, amount: number, line: { categoryId?: string; transferAccountId?: string }) {
  return createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw: "Example",
    lines: [{ amount, ...line }],
    ...saved,
  });
}

function monthly(db: Db, input: Pick<PlanCreate, "name" | "kind" | "accountId" | "expectedAmount" | "monthDay"> & Partial<PlanCreate>) {
  return createPlan(db, {
    tolerance: 0,
    amountMode: "fixed",
    startDate: `2026-01-${String(input.monthDay).padStart(2, "0")}`,
    freq: "monthly",
    interval: 1,
    businessDayShift: "none",
    active: true,
    fundsBuckets: false,
    ...input,
    ...saved,
  });
}

test("forecast months: unlinked income, bills and variable spending; card payments and transfers are not spending", () => {
  const book = tempDatabase();
  try {
    const cash = createAccount(book.db, { name: "Cash", kind: "chequing", openingDate: "2026-01-01", openingBalance: 5_000_000, ...saved });
    const savings = createAccount(book.db, { name: "Savings", kind: "savings", openingDate: "2026-01-01", openingBalance: 0, ...saved });
    const card = createAccount(book.db, {
      name: "Card",
      kind: "credit_card",
      openingDate: "2026-01-01",
      openingBalance: 0,
      paymentPolicy: "full",
      fixedPayment: null,
      ...saved,
    });
    const pay = createCategory(book.db, { name: "Pay", kind: "income", ...saved });
    const groceries = createCategory(book.db, { name: "Groceries", kind: "expense", ...saved });
    const dining = createCategory(book.db, { name: "Dining", kind: "expense", ...saved });

    const salary = monthly(book.db, { name: "Pay", kind: "income", accountId: cash.id, expectedAmount: 50_000, monthDay: 1, categoryId: pay.id, fundsBuckets: true });
    monthly(book.db, { name: "Rent", kind: "bill", accountId: cash.id, expectedAmount: -30_000, monthDay: 20 });
    monthly(book.db, { name: "Save", kind: "transfer", accountId: cash.id, expectedAmount: -10_000, monthDay: 15, transferAccountId: savings.id });
    const paid = record(book.db, cash.id, "2026-10-01", 50_000, { categoryId: pay.id });
    linkOccurrence(book.db, salary.id, "2026-10-01", paid.id, saved);

    for (const month of ["2026-07", "2026-08", "2026-09"]) {
      record(book.db, cash.id, `${month}-15`, -93_000, { categoryId: groceries.id });
    }
    createBucket(book.db, {
      name: "Food",
      kind: "spending",
      priority: 1,
      essential: false,
      color: "mint",
      icon: "shopping-cart",
      categoryIds: [dining.id],
      refillTo: 31_000,
      amount: null,
      dueDate: null,
      repeat: null,
      target: null,
      targetDate: null,
      fixedAmount: null,
      asOf: "2000-01-01",
      ...saved,
    });
    record(book.db, cash.id, "2026-06-10", -5_000, { categoryId: dining.id });

    record(book.db, card.id, "2026-08-01", -10_000, {});
    record(book.db, cash.id, "2026-08-22", -10_000, { transferAccountId: card.id });
    record(book.db, card.id, "2026-09-01", -10_000, {});
    record(book.db, cash.id, "2026-09-22", -10_000, { transferAccountId: card.id });
    record(book.db, card.id, "2026-10-01", -20_000, {});

    const forecast = readForecast(book.db, "2026-10-01");
    const cashRow = forecast.accounts.find((row) => row.accountId === cash.id);
    const due = forecast.dates.indexOf("2026-10-22");
    expect((cashRow?.known[due] ?? 0) - (cashRow?.known[due - 1] ?? 0)).toBe(-20_000);

    expect(forecast.months).toEqual([
      { month: "2026-10", income: 0, spending: 30_000 + 93_000 + 31_000 },
      { month: "2026-11", income: 50_000, spending: 30_000 + 93_000 + 31_000 },
      { month: "2026-12", income: 50_000, spending: 30_000 + 3_000 * 29 + 1_000 * 29 },
    ]);
  } finally {
    book.close();
  }
});

test("category spending uses complete months only: not the month of asOf", () => {
  const book = tempDatabase();
  try {
    const cash = createAccount(book.db, { name: "Cash", kind: "chequing", openingDate: "2026-01-01", openingBalance: 5_000_000, ...saved });
    const groceries = createCategory(book.db, { name: "Groceries", kind: "expense", ...saved });
    record(book.db, cash.id, "2026-01-15", -31_000, { categoryId: groceries.id });
    record(book.db, cash.id, "2026-02-15", -31_000, { categoryId: groceries.id });
    record(book.db, cash.id, "2026-03-15", -62_000, { categoryId: groceries.id });
    record(book.db, cash.id, "2026-04-05", -62_000, { categoryId: groceries.id });

    const inApril = readForecast(book.db, "2026-04-30");
    expect(inApril.months[1]).toEqual({ month: "2026-05", income: 0, spending: 31_000 });
    const inMay = readForecast(book.db, "2026-05-01");
    expect(inMay.months[1]).toEqual({ month: "2026-06", income: 0, spending: 62_000 });
  } finally {
    book.close();
  }
});

test("category spending does not count months before the first transaction", () => {
  const book = tempDatabase();
  try {
    const cash = createAccount(book.db, { name: "Cash", kind: "chequing", openingDate: "2026-01-01", openingBalance: 5_000_000, ...saved });
    const groceries = createCategory(book.db, { name: "Groceries", kind: "expense", ...saved });
    record(book.db, cash.id, "2026-03-15", -31_000, { categoryId: groceries.id });

    const noMonth = readForecast(book.db, "2026-03-20");
    expect(noMonth.months[1]).toEqual({ month: "2026-04", income: 0, spending: 0 });
    const oneMonth = readForecast(book.db, "2026-04-20");
    expect(oneMonth.months[1]).toEqual({ month: "2026-05", income: 0, spending: 31_000 });
  } finally {
    book.close();
  }
});
