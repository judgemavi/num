import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog, migrateDatabase, openDatabase, settings } from "@num/db";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { medianAmount } from "@num/shared";
import { unbucketedSpending } from "./forecast-spending";
import { createAccount } from "./accounts";
import { createBucket } from "./buckets";
import { createCategory } from "./categories";
import { readForecast } from "./forecast";
import { linkOccurrence } from "./recurring-links";
import { createSchedule } from "./schedule-test-book";
import { createTransaction } from "./transactions";

// Test oracle: the line-based forecast rule, independent of the SQL aggregate.
/** `step` is the milliunits in one minor unit of the book currency. The result is a whole number of minor units. */
function unbucketedMonthly(months: readonly string[], lines: readonly { month: string; amount: number }[], step: number): number {
  if (months.length === 0 || lines.length === 0) {
    return 0;
  }
  const medianLine = medianAmount(lines.map((line) => line.amount), 1);
  const limit = Math.abs(medianLine) * 3;
  const totals = new Map<string, number>(months.map((month) => [month, 0]));
  for (const line of lines) {
    if (Math.abs(line.amount) > limit) {
      continue;
    }
    const current = totals.get(line.month);
    if (current === undefined) {
      continue;
    }
    totals.set(line.month, current + line.amount);
  }
  const median = medianAmount(months.map((month) => totals.get(month) ?? 0), step);
  return median < 0 ? -median : 0;
}

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
  return createAccount(db, { asOf: "2026-10-07", name, kind: "chequing", openingDate: "2026-01-01", openingBalance, ...saved });
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
      canRecede: null,
      schedule: null,
      asOf: "2000-01-01",
      ...saved,
    });
    for (const month of ["2026-07", "2026-08", "2026-09"]) {
      spend(book.db, cash.id, groceries.id, `${month}-15`, -90_000);
    }
    const forecast = readForecast(book.db, "2026-10-01");
    expect(forecast.total[0]).toBe(1_000_000 - 270_000 - 1_000);
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
    expect(forecast.total[0]).toBe(1_000_000 - 203_000 - 40);
  } finally {
    book.close();
  }
});

test("a forecast read does not write a snapshot", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 10_000);
    createSchedule(book.db, {
      name: "Rent",
      kind: "commitment",
      accountId: cash.id,
      expectedAmount: -4_000,
      tolerance: 0,
      amountMode: "fixed",
      startDate: "2026-10-31",
      freq: "monthly",
      interval: 1,
      monthDay: 31,
      businessDayShift: "none",
      ...saved,
    });
    const before = book.db.select().from(auditLog).all().length;
    const first = readForecast(book.db, "2026-10-08");
    const end = first.dates.indexOf("2026-10-31");
    expect(first.total[end]).toBe(6_000);
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
    const salary = createSchedule(book.db, {
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
      linkOccurrence(book.db, salary.id, date, txn.id, saved);
    }
    const forecast = readForecast(book.db, "2026-07-01");
    expect(forecast.total[0]).toBe(21_000 + 3_500);
  } finally {
    book.close();
  }
});



test("monthly SQL sums keep the line outlier limit, missing months and refunds", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 1_000_000);
    const months = ["2026-07", "2026-08", "2026-09"];
    const cases = [
      [-1_000, -1_000, -2_000, -10_000],
      [-1_000, 1_000, -1_000],
      [-1_000, -1_010, -1_020, -100_000],
      [1_000, 1_000, 1_000],
      [-2_000],
    ];
    const expected: number[] = [];
    for (const [index, amounts] of cases.entries()) {
      const category = expense(book.db, `Synthetic ${index}`);
      const rows = amounts.map((amount, i) => ({ amount, month: months[i % months.length] ?? "2026-07" }));
      for (const row of rows) spend(book.db, cash.id, category.id, `${row.month}-15`, row.amount);
      const monthly = unbucketedMonthly(months, rows, 10);
      if (monthly > 0) expected.push(monthly);
    }
    expect(unbucketedSpending(book.db, months, 10).map((row) => row.monthly).sort((a, b) => a - b)).toEqual(expected.sort((a, b) => a - b));
  } finally {
    book.close();
  }
});

test("forecast months include loan commitments and exclude transfers between open budget accounts", () => {
  const book = tempDatabase();
  try {
    const cash = cashAccount(book.db, "Cash", 1_000_000);
    const loan = createAccount(book.db, { name: "Loan", kind: "loan", asOf: "2026-10-01", ...saved });
    const card = createAccount(book.db, { name: "Card", kind: "credit_card", paymentPolicy: "full", asOf: "2026-10-01", ...saved });
    for (const target of [loan, card]) {
      createSchedule(book.db, {
        name: target.name, kind: "commitment", accountId: cash.id, transferAccountId: target.id,
        expectedAmount: -10_000, tolerance: 0, amountMode: "fixed", startDate: "2026-10-15",
        freq: "monthly", interval: 1, monthDay: 15, businessDayShift: "none", ...saved,
      });
    }
    const forecast = readForecast(book.db, "2026-10-01");
    expect(forecast.months.find((month) => month.month === "2026-10")?.spending).toBe(10_000);
    expect(forecast.months.find((month) => month.month === "2026-11")?.spending).toBe(10_000);
    expect(forecast.total[forecast.dates.indexOf("2026-10-15")]).toBe(990_000);
  } finally {
    book.close();
  }
});
