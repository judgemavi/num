import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings } from "@num/db";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { readInsights } from "./insights";
import { createSchedule } from "./schedule-test-book";
import { createTransaction } from "./transactions";

const saved = { source: "ui" as const, at: "2026-10-15T16:00:00Z" };

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-timeline-"));
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

function record(db: Db, accountId: string, date: string, amount: number, categoryId: string) {
  return createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw: "Example",
    lines: [{ amount, categoryId }],
    ...saved,
  });
}

function monthly(db: Db, accountId: string, kind: "income" | "commitment", expectedAmount: number, monthDay: number) {
  return createSchedule(db, {
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
    ...saved,
  });
}

test("the month of asOf has an actual part to asOf and a forecast part after it", () => {
  const book = tempDatabase();
  try {
    const cash = createAccount(book.db, { name: "Cash", kind: "chequing", openingDate: "2026-08-01", openingBalance: 100_000, ...saved });
    const pay = createCategory(book.db, { name: "Pay", kind: "income", ...saved });
    const groceries = createCategory(book.db, { name: "Groceries", kind: "expense", ...saved });
    record(book.db, cash.id, "2026-09-12", -7000, groceries.id);
    record(book.db, cash.id, "2026-10-01", 20_000, pay.id);
    record(book.db, cash.id, "2026-10-05", -5000, groceries.id);
    record(book.db, cash.id, "2026-10-14", 1000, groceries.id);
    record(book.db, cash.id, "2026-10-18", -9000, groceries.id);
    monthly(book.db, cash.id, "commitment", -10_000, 25);
    monthly(book.db, cash.id, "income", 30_000, 28);

    // September is the one complete month. Its 7000 is the monthly estimate: 230 on days 1 to 18, then 220.
    const asOf = "2026-10-15";
    const report = readInsights(book.db, { asOf, window: "3" });
    const months = report.timeline.months;
    expect(months.map((item) => item.month)).toEqual(["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
    expect(months[1]).toEqual({ month: "2026-09", actual: { income: 0, spending: 7000 }, forecast: null });
    expect(months[2]).toEqual({
      month: "2026-10",
      actual: { income: 20_000, spending: 4000 },
      forecast: { income: 30_000, spending: 10_000 + 4 * 230 + 13 * 220 },
    });
    expect(months[3]).toEqual({ month: "2026-11", actual: null, forecast: { income: 30_000, spending: 10_000 + 7000 } });

    expect(report.timeline.forecastEnd).toBe("2027-01-12");

    const category = readInsights(book.db, { asOf, window: "3", category: groceries.id });
    expect(category.timeline.forecastEnd).toBeNull();
    expect(category.timeline.months).toEqual([
      { month: "2026-08", actual: { income: 0, spending: 0 }, forecast: null },
      { month: "2026-09", actual: { income: 0, spending: 7000 }, forecast: null },
      { month: "2026-10", actual: { income: 0, spending: 4000 }, forecast: null },
    ]);
  } finally {
    book.close();
  }
});

test("a period that ends before asOf has only its own months and no forecast", () => {
  const book = tempDatabase();
  try {
    const cash = createAccount(book.db, { name: "Cash", kind: "chequing", openingDate: "2026-08-01", openingBalance: 100_000, ...saved });
    const groceries = createCategory(book.db, { name: "Groceries", kind: "expense", ...saved });
    record(book.db, cash.id, "2026-08-12", -7000, groceries.id);
    record(book.db, cash.id, "2026-09-25", -3000, groceries.id);
    monthly(book.db, cash.id, "commitment", -10_000, 25);

    const report = readInsights(book.db, { asOf: "2026-10-15", window: "custom", from: "2026-08-01", to: "2026-09-20" });
    expect(report.timeline.forecastEnd).toBeNull();
    expect(report.timeline.months).toEqual([
      { month: "2026-08", actual: { income: 0, spending: 7000 }, forecast: null },
      { month: "2026-09", actual: { income: 0, spending: 0 }, forecast: null },
    ]);
  } finally {
    book.close();
  }
});
