import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog, migrateDatabase, openDatabase, settings } from "@num/db";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createBucket } from "./buckets";
import { createCategory } from "./categories";
import { readForecast } from "./forecast";
import { linkOccurrence } from "./recurring-links";
import { createPlan } from "./recurring-plans";
import { createTransaction } from "./transactions";

const at = "2026-10-08T16:00:00Z";
const saved = { source: "ui" as const, at };

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-forecast-"));
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

function cashAccount(db: Db, name: string, openingBalance: number) {
  return createAccount(db, { name, kind: "chequing", openingDate: "2026-01-01", openingBalance, ...saved });
}

function cardAccount(db: Db, policy: "full" | "manual" | "fixed", fixedPayment: number | null = null) {
  return createAccount(db, {
    name: "Card",
    kind: "credit_card",
    openingDate: "2026-01-01",
    openingBalance: 0,
    paymentPolicy: policy,
    fixedPayment,
    ...saved,
  });
}

function expense(db: Db, name: string) {
  return createCategory(db, { name, kind: "expense", ...saved });
}

function spend(db: Db, accountId: string, categoryId: string, date: string, amount: number) {
  return createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw: "Shop",
    lines: [{ amount, categoryId }],
    ...saved,
  });
}

function payCard(db: Db, fromId: string, cardId: string, date: string, amount: number) {
  return createTransaction(db, {
    accountId: fromId,
    date,
    amount: -amount,
    payeeRaw: "Card payment",
    lines: [{ amount: -amount, transferAccountId: cardId }],
    ...saved,
  });
}

test("a card purchase moves cash on the payment day only", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 500_000);
    const card = cardAccount(book.db, "full");
    const groceries = expense(book.db, "Groceries");
    spend(book.db, card.id, groceries.id, "2026-08-01", -10_000);
    payCard(book.db, cash.id, card.id, "2026-08-22", 10_000);
    spend(book.db, card.id, groceries.id, "2026-09-01", -10_000);
    payCard(book.db, cash.id, card.id, "2026-09-22", 10_000);
    spend(book.db, card.id, groceries.id, "2026-10-01", -20_000);

    const forecast = readForecast(book.db, "2026-10-08");
    const cashRow = forecast.accounts.find((row) => row.accountId === cash.id);
    const cardRow = forecast.accounts.find((row) => row.accountId === card.id);
    const before = forecast.dates.indexOf("2026-10-21");
    const due = forecast.dates.indexOf("2026-10-22");
    expect(cashRow?.known[before]).toBe(480_000);
    expect(cashRow?.known[due]).toBe(460_000);
    expect(cardRow?.known[before]).toBe(-20_000);
    expect(cardRow?.known[due]).toBe(0);
    expect(forecast.total.known[before]).toBe(forecast.total.known[due]);
  } finally {
    book.close();
  }
});

test("bucket spending is not counted two times", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 1_000_000);
    const groceries = expense(book.db, "Groceries");
    createBucket(book.db, {
      name: "Food",
      kind: "spending",
      priority: 1,
      essential: false,
      color: "mint",
      icon: "shopping-cart",
      categoryIds: [groceries.id],
      refillTo: 31_000,
      amount: null,
      dueDate: null,
      repeat: null,
      target: null,
      targetDate: null,
      fixedAmount: null,
      months: null,
      fillMonths: null,
      asOf: "2000-01-01",
      ...saved,
    });
    for (const month of ["2026-07", "2026-08", "2026-09"]) {
      spend(book.db, cash.id, groceries.id, `${month}-15`, -90_000);
    }
    const forecast = readForecast(book.db, "2026-10-01");
    const row = forecast.accounts.find((item) => item.accountId === cash.id);
    expect(row?.estimated[0]).toBe((row?.known[0] ?? 0) - 1_000);
  } finally {
    book.close();
  }
});

test("outlier lines are not included in category spending", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 1_000_000);
    const snacks = expense(book.db, "Snacks");
    for (const month of ["2026-01", "2026-02", "2026-03"]) {
      spend(book.db, cash.id, snacks.id, `${month}-15`, -1_000);
    }
    spend(book.db, cash.id, snacks.id, "2026-02-16", -100_000);
    spend(book.db, cash.id, snacks.id, "2026-03-16", -100_000);
    const forecast = readForecast(book.db, "2026-04-01");
    const row = forecast.accounts.find((item) => item.accountId === cash.id);
    expect(row?.estimated[0]).toBe((row?.known[0] ?? 0) - 40);
  } finally {
    book.close();
  }
});

test("a forecast read does not write a snapshot", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 10_000);
    createPlan(book.db, {
      name: "Rent",
      kind: "bill",
      accountId: cash.id,
      expectedAmount: -4_000,
      tolerance: 0,
      amountMode: "fixed",
      startDate: "2026-10-31",
      freq: "monthly",
      interval: 1,
      monthDay: 31,
      businessDayShift: "none",
      active: true,
      fundsBuckets: false,
      ...saved,
    });
    const before = book.db.select().from(auditLog).all().length;
    const first = readForecast(book.db, "2026-10-08");
    const end = first.dates.indexOf("2026-10-31");
    expect(first.total.estimated[end]).toBe(6_000);
    expect(book.db.select().from(auditLog).all()).toHaveLength(before);
    readForecast(book.db, "2026-10-20");
    expect(book.db.select().from(auditLog).all()).toHaveLength(before);
  } finally {
    book.close();
  }
});

test("variable income uses the median of the last 6 actuals", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 0);
    const pay = createCategory(book.db, { name: "Pay", kind: "income", ...saved });
    const plan = createPlan(book.db, {
      name: "Pay",
      kind: "income",
      accountId: cash.id,
      expectedAmount: 99_990,
      tolerance: 200_000,
      amountMode: "variable",
      categoryId: pay.id,
      startDate: "2026-01-01",
      freq: "monthly",
      interval: 1,
      monthDay: 1,
      businessDayShift: "none",
      active: true,
      fundsBuckets: true,
      ...saved,
    });
    const amounts = [1_000, 2_000, 3_000, 4_000, 5_000, 6_000];
    for (const [index, amount] of amounts.entries()) {
      const month = String(index + 1).padStart(2, "0");
      const date = `2026-${month}-01`;
      const txn = createTransaction(book.db, {
        accountId: cash.id,
        date,
        amount,
        payeeRaw: "Payroll",
        lines: [{ amount, categoryId: pay.id }],
        ...saved,
      });
      linkOccurrence(book.db, plan.id, date, txn.id, saved);
    }
    const forecast = readForecast(book.db, "2026-07-01");
    const row = forecast.accounts.find((item) => item.accountId === cash.id);
    expect(row?.known[0]).toBe(21_000 + 3_500);
  } finally {
    book.close();
  }
});

function safeToSpend(income: boolean): number {
  const book = tempDatabase();
  try {
    book.db.insert(settings).values({ key: "bufferAmount", value: "2000" }).run();
    const cash = cashAccount(book.db, "Cash", 1_000_000);
    createPlan(book.db, {
      name: "Rent",
      kind: "bill",
      accountId: cash.id,
      expectedAmount: -30_000,
      tolerance: 0,
      amountMode: "fixed",
      startDate: "2026-10-20",
      freq: "monthly",
      interval: 1,
      monthDay: 20,
      businessDayShift: "none",
      active: true,
      fundsBuckets: false,
      ...saved,
    });
    if (income) {
      createPlan(book.db, {
        name: "Pay",
        kind: "income",
        accountId: cash.id,
        expectedAmount: 50_000,
        tolerance: 0,
        amountMode: "fixed",
        startDate: "2026-10-10",
        freq: "monthly",
        interval: 1,
        monthDay: 10,
        businessDayShift: "none",
        active: true,
        fundsBuckets: true,
        ...saved,
      });
    }
    return readForecast(book.db, "2026-10-01").safeToSpend;
  } finally {
    book.close();
  }
}

test("safe to spend uses the next paycheck, or 30 days when there is no income plan", () => {
  expect(safeToSpend(true)).toBe(998_000);
  expect(safeToSpend(false)).toBe(968_000);
});

