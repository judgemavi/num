import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings } from "@num/db";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { readForecast } from "./forecast";
import { linkOccurrence, skipOccurrence } from "./recurring-links";
import { createSchedule } from "./schedule-test-book";
import { createTransaction } from "./transactions";

const at = "2026-10-08T16:00:00Z";
const saved = { source: "ui" as const, at };

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-forecast-rules-"));
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

function bill(
  db: Db,
  accountId: string,
  amount: number,
  startDate: string,
  shift: "none" | "next" = "none",
  monthDay = 15,
  endDate: string | null = null,
) {
  return createSchedule(db, {
    name: `Bill ${startDate}`,
    kind: "commitment",
    accountId,
    expectedAmount: amount,
    tolerance: 0,
    amountMode: "fixed",
    startDate,
    freq: "monthly",
    interval: 1,
    monthDay,
    businessDayShift: shift,
    endDate,
    ...saved,
  });
}

test("off-budget lines are excluded from category medians", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 1_000_000);
    const outside = createAccount(book.db, {
      name: "Outside",
      kind: "chequing",
      onBudget: false,
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const snacks = expense(book.db, "Snacks");
    for (const month of ["2026-01", "2026-02", "2026-03"]) {
      spend(book.db, cash.id, snacks.id, `${month}-10`, -1_000);
      spend(book.db, outside.id, snacks.id, `${month}-11`, -100_000);
    }
    const forecast = readForecast(book.db, "2026-04-01");
    expect(forecast.total[0]).toBe(1_000_000 - 3_000 - 40);
  } finally {
    book.close();
  }
});

test("a business-day shift moves the bill, and skipped or linked occurrences are excluded", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 100_000);
    bill(book.db, cash.id, -4_000, "2026-10-10", "next", 10, "2026-10-10");
    const rent = bill(book.db, cash.id, -10_000, "2026-10-15");
    const linked = spend(book.db, cash.id, expense(book.db, "Rent").id, "2026-10-15", -10_000);
    linkOccurrence(book.db, rent.id, "2026-10-15", linked.id, saved);
    skipOccurrence(book.db, rent.id, "2026-11-15", "Away", saved);
    const forecast = readForecast(book.db, "2026-10-01");
    const atDate = (iso: string) => forecast.total[forecast.dates.indexOf(iso)];
    expect(atDate("2026-10-10")).toBe(100_000);
    expect(atDate("2026-10-12")).toBe(96_000);
    expect(atDate("2026-10-15")).toBe(86_000);
    expect(atDate("2026-11-15")).toBe(86_000);
    expect(atDate("2026-12-15")).toBe(76_000);
  } finally {
    book.close();
  }
});

test("a payment linked to a bill is not in the category median", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 1_000_000);
    const snacks = expense(book.db, "Snacks");
    const rent = bill(book.db, cash.id, -4_000, "2026-01-12", "none", 12);
    for (const month of ["2026-01", "2026-02", "2026-03"]) {
      spend(book.db, cash.id, snacks.id, `${month}-10`, -1_000);
      const linked = spend(book.db, cash.id, snacks.id, `${month}-12`, -4_000);
      linkOccurrence(book.db, rent.id, `${month}-12`, linked.id, saved);
    }
    const forecast = readForecast(book.db, "2026-04-01");
    expect(forecast.total[0]).toBe(1_000_000 - 15_000 - 40);
  } finally {
    book.close();
  }
});
