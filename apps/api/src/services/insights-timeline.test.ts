import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase } from "@num/db";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { archiveAccount, createAccount } from "./accounts";
import { createCategory } from "./categories";
import { readInsights } from "./insights";
import { createPlan } from "./recurring-plans";
import { createTransaction } from "./transactions";

const saved = { source: "ui" as const, at: "2026-10-15T16:00:00Z" };

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-timeline-"));
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

function record(db: Db, accountId: string, date: string, amount: number, categoryId: string) {
  return createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw: "Example",
    status: "open",
    lines: [{ amount, categoryId }],
    ...saved,
  });
}

function monthly(db: Db, accountId: string, kind: "income" | "bill", expectedAmount: number, monthDay: number) {
  return createPlan(db, {
    name: kind,
    kind,
    accountId,
    expectedAmount,
    tolerance: 0,
    amountMode: "fixed",
    startDate: `2026-01-${monthDay}`,
    freq: "monthly",
    interval: 1,
    monthDay,
    businessDayShift: "none",
    active: true,
    fundsBuckets: false,
    ...saved,
  });
}

test("the month of asOf has an actual part to asOf and a forecast part after it", () => {
  const book = tempDatabase();
  try {
    const cash = createAccount(book.db, { name: "Cash", kind: "chequing", openingDate: "2026-08-01", openingBalance: 10_000, ...saved });
    const pay = createCategory(book.db, { name: "Pay", kind: "income", ...saved });
    const groceries = createCategory(book.db, { name: "Groceries", kind: "expense", ...saved });
    record(book.db, cash.id, "2026-09-12", -700, groceries.id);
    record(book.db, cash.id, "2026-10-01", 2_000, pay.id);
    record(book.db, cash.id, "2026-10-05", -500, groceries.id);
    record(book.db, cash.id, "2026-10-14", 100, groceries.id);
    record(book.db, cash.id, "2026-10-18", -900, groceries.id);
    monthly(book.db, cash.id, "bill", -1_000, 25);
    monthly(book.db, cash.id, "income", 3_000, 28);

    const asOf = "2026-10-15";
    const report = readInsights(book.db, { asOf, window: "3" });
    const months = report.timeline.months;
    expect(months.map((item) => item.month)).toEqual(["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
    expect(months[1]).toEqual({ month: "2026-09", actual: { income: 0, spending: 700 }, forecast: null });
    expect(months[2]).toEqual({
      month: "2026-10",
      actual: { income: 2_000, spending: 400 },
      forecast: { income: 3_000, spending: 1_000 },
    });
    expect(months[3]).toEqual({ month: "2026-11", actual: null, forecast: { income: 3_000, spending: 1_000 } });

    const balances = report.timeline.balances;
    expect(balances[0]).toEqual({ date: "2026-08-01", amount: 10_000 });
    expect(balances.at(-1)).toEqual({ date: asOf, amount: 10_000 - 700 + 2_000 - 500 + 100 });
    expect(report.timeline.forecast?.dates[0]).toBe(asOf);
    expect(report.timeline.forecast?.dates).toHaveLength(90);

    const category = readInsights(book.db, { asOf, window: "3", category: groceries.id });
    expect(category.timeline.forecast).toBeNull();
    expect(category.timeline.balances).toEqual([]);
    expect(category.timeline.months).toEqual([
      { month: "2026-08", actual: { income: 0, spending: 0 }, forecast: null },
      { month: "2026-09", actual: { income: 0, spending: 700 }, forecast: null },
      { month: "2026-10", actual: { income: 0, spending: 400 }, forecast: null },
    ]);
  } finally {
    book.close();
  }
});

test("a period that ends before asOf has only its own months and no forecast", () => {
  const book = tempDatabase();
  try {
    const cash = createAccount(book.db, { name: "Cash", kind: "chequing", openingDate: "2026-08-01", openingBalance: 10_000, ...saved });
    const groceries = createCategory(book.db, { name: "Groceries", kind: "expense", ...saved });
    record(book.db, cash.id, "2026-08-12", -700, groceries.id);
    record(book.db, cash.id, "2026-09-25", -300, groceries.id);
    monthly(book.db, cash.id, "bill", -1_000, 25);

    const report = readInsights(book.db, { asOf: "2026-10-15", window: "custom", from: "2026-08-01", to: "2026-09-20" });
    expect(report.timeline.forecast).toBeNull();
    expect(report.timeline.months).toEqual([
      { month: "2026-08", actual: { income: 0, spending: 700 }, forecast: null },
      { month: "2026-09", actual: { income: 0, spending: 0 }, forecast: null },
    ]);
    expect(report.timeline.balances.at(-1)).toEqual({ date: "2026-09-20", amount: 9_300 });
  } finally {
    book.close();
  }
});

test("an archived account counts in the balance line up to and including its archive date", () => {
  const book = tempDatabase();
  try {
    createAccount(book.db, { name: "Cash", kind: "chequing", openingDate: "2026-08-01", openingBalance: 10_000, ...saved });
    const old = createAccount(book.db, { name: "Old", kind: "savings", openingDate: "2026-08-01", openingBalance: 2_500, ...saved });
    archiveAccount(book.db, old.id, { confirm: true, source: "ui", at: "2026-09-10T23:30:00Z" });

    const balances = readInsights(book.db, { asOf: "2026-10-15", window: "3" }).timeline.balances;
    expect(balances.find((point) => point.date === "2026-09-10")?.amount).toBe(12_500);
    expect(balances.find((point) => point.date === "2026-09-11")?.amount).toBe(10_000);
  } finally {
    book.close();
  }
});
