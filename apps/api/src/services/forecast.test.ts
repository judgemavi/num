import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog, forecastSnapshots, migrateDatabase, monthCloses, openDatabase, settings } from "@num/db";
import { eq } from "drizzle-orm";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createBucket } from "./buckets";
import { createCategory } from "./categories";
import { createCheckpoint } from "./checkpoints";
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
  return {
    db: createDb(sqlite),
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
    status: "open",
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
    status: "open",
    lines: [{ amount: -amount, transferAccountId: cardId }],
    ...saved,
  });
}

function closeMonth(db: Db, month: string) {
  db.insert(monthCloses)
    .values({ month, closedAt: at, reopenedAt: null, reopenReason: null, summaryJson: "{}" })
    .run();
}

test("a card purchase moves cash on the due date only", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 50_000);
    const card = cardAccount(book.db, "full");
    const groceries = expense(book.db, "Groceries");
    spend(book.db, card.id, groceries.id, "2026-08-01", -1_000);
    createCheckpoint(book.db, card.id, { date: "2026-08-01", statementBalance: -1_000, ...saved });
    payCard(book.db, cash.id, card.id, "2026-08-22", 1_000);
    spend(book.db, card.id, groceries.id, "2026-09-01", -1_000);
    createCheckpoint(book.db, card.id, { date: "2026-09-01", statementBalance: -1_000, ...saved });
    payCard(book.db, cash.id, card.id, "2026-09-22", 1_000);
    spend(book.db, card.id, groceries.id, "2026-10-01", -2_000);
    createCheckpoint(book.db, card.id, { date: "2026-10-01", statementBalance: -2_000, ...saved });

    const forecast = readForecast(book.db, "2026-10-08", saved);
    const cashRow = forecast.accounts.find((row) => row.accountId === cash.id);
    const cardRow = forecast.accounts.find((row) => row.accountId === card.id);
    const before = forecast.dates.indexOf("2026-10-21");
    const due = forecast.dates.indexOf("2026-10-22");
    expect(cashRow?.known[before]).toBe(48_000);
    expect(cashRow?.known[due]).toBe(46_000);
    expect(cardRow?.known[before]).toBe(-2_000);
    expect(cardRow?.known[due]).toBe(0);
    expect(forecast.total.known[before]).toBe(forecast.total.known[due]);
  } finally {
    book.close();
  }
});

test("bucket spending is not counted two times", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 100_000);
    const groceries = expense(book.db, "Groceries");
    createBucket(book.db, {
      name: "Food",
      kind: "spending",
      priority: 1,
      essential: false,
      color: "mint",
      icon: "shopping-cart",
      categoryIds: [groceries.id],
      refillTo: 3_100,
      amount: null,
      dueDate: null,
      repeat: null,
      target: null,
      targetDate: null,
      fixedAmount: null,
      ...saved,
    });
    for (const month of ["2026-07", "2026-08", "2026-09"]) {
      closeMonth(book.db, month);
      spend(book.db, cash.id, groceries.id, `${month}-15`, -9_000);
    }
    const forecast = readForecast(book.db, "2026-10-01", saved);
    const row = forecast.accounts.find((item) => item.accountId === cash.id);
    expect(row?.estimated[0]).toBe((row?.known[0] ?? 0) - 100);
  } finally {
    book.close();
  }
});

test("outlier lines are not included in category spending", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 100_000);
    const snacks = expense(book.db, "Snacks");
    for (const month of ["2026-01", "2026-02", "2026-03"]) {
      closeMonth(book.db, month);
      spend(book.db, cash.id, snacks.id, `${month}-15`, -100);
    }
    spend(book.db, cash.id, snacks.id, "2026-02-16", -10_000);
    spend(book.db, cash.id, snacks.id, "2026-03-16", -10_000);
    const forecast = readForecast(book.db, "2026-04-01", saved);
    const row = forecast.accounts.find((item) => item.accountId === cash.id);
    expect(row?.estimated[0]).toBe((row?.known[0] ?? 0) - 4);
  } finally {
    book.close();
  }
});

test("the first forecast in a month stores the month-end total once", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 1_000);
    createPlan(book.db, {
      name: "Rent",
      kind: "bill",
      accountId: cash.id,
      expectedAmount: -400,
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
    const first = readForecast(book.db, "2026-10-08", saved);
    const end = first.dates.indexOf("2026-10-31");
    expect(book.db.select().from(forecastSnapshots).all()).toEqual([
      { month: "2026-10", asOf: "2026-10-08", predictedTotal: first.total.estimated[end], createdAt: at },
    ]);
    expect(first.total.estimated[end]).toBe(600);
    spend(book.db, cash.id, expense(book.db, "Misc").id, "2026-10-09", -100);
    readForecast(book.db, "2026-10-20", saved);
    expect(book.db.select().from(forecastSnapshots).where(eq(forecastSnapshots.month, "2026-10")).all()).toHaveLength(1);
    expect(book.db.select().from(forecastSnapshots).all()[0]?.predictedTotal).toBe(600);
    expect(book.db.select().from(auditLog).where(eq(auditLog.entity, "forecast_snapshot")).all()).toHaveLength(1);
    readForecast(book.db, "2026-11-02", saved);
    expect(book.db.select().from(forecastSnapshots).all()).toHaveLength(2);
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
      expectedAmount: 9_999,
      tolerance: 20_000,
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
    const amounts = [100, 200, 300, 400, 500, 600];
    for (const [index, amount] of amounts.entries()) {
      const month = String(index + 1).padStart(2, "0");
      const date = `2026-${month}-01`;
      const txn = createTransaction(book.db, {
        accountId: cash.id,
        date,
        amount,
        payeeRaw: "Payroll",
        status: "open",
        lines: [{ amount, categoryId: pay.id }],
        ...saved,
      });
      linkOccurrence(book.db, plan.id, date, txn.id, saved);
    }
    const forecast = readForecast(book.db, "2026-07-01", saved);
    const row = forecast.accounts.find((item) => item.accountId === cash.id);
    expect(row?.known[0]).toBe(2_100 + 350);
  } finally {
    book.close();
  }
});

function safeToSpend(income: boolean): number {
  const book = tempDatabase();
  try {
    book.db.insert(settings).values({ key: "bufferAmount", value: "200" }).run();
    const cash = cashAccount(book.db, "Cash", 100_000);
    createPlan(book.db, {
      name: "Rent",
      kind: "bill",
      accountId: cash.id,
      expectedAmount: -3_000,
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
        expectedAmount: 5_000,
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
    return readForecast(book.db, "2026-10-01", saved).safeToSpend;
  } finally {
    book.close();
  }
}

test("safe to spend uses the next paycheck, or 30 days when there is no income plan", () => {
  expect(safeToSpend(true)).toBe(99_800);
  expect(safeToSpend(false)).toBe(96_800);
});
