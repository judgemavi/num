import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings } from "@num/db";
import type { ErrorCode } from "@num/shared";
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { createApp } from "../app";
import { createDb } from "../db";
import { ServiceError } from "../service-error";
import { createAccount } from "./accounts";
import { createBucketEvent } from "./bucket-events";
import { archiveBucket, createBucket } from "./buckets";
import { createCategory } from "./categories";
import { fillBuckets } from "./funding-fill";
import { undoMonthFunding } from "./funding-months";
import { readMonthPlan } from "./month-plan";
import { linkOccurrence } from "./recurring-links";
import { createSchedule } from "./schedule-test-book";
import { createTransaction, deleteTransaction } from "./transactions";

const saved = { source: "ui" as const, at: "2026-03-20T16:00:00Z" };

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-month-plan-"));
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

function expectCode(run: () => void, code: ErrorCode) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceError);
    expect((error as ServiceError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

test("funding and spending inside the month do not change the plan", () => {
  const book = tempDatabase();
  try {
    const cash = createAccount(book.db, {
      name: "Cash",
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 10_000_000,
      paymentPolicy: null,
      ...saved,
    });
    const groceries = createCategory(book.db, { name: "Groceries", kind: "expense", ...saved });
    createSchedule(book.db, {
      name: "Pay",
      kind: "income",
      accountId: cash.id,
      expectedAmount: 1_000_000,
      tolerance: 0,
      amountMode: "fixed",
      startDate: "2026-03-01",
      freq: "monthly",
      interval: 1,
      monthDay: 1,
      businessDayShift: "none",
      payday: true,
      ...saved,
    });
    const food = createBucket(book.db, {
      name: "Food",
      kind: "spending",
      priority: 1,
      essential: false,
      color: "mint",
      icon: "shopping-cart",
      categoryIds: [groceries.id],
      refillTo: 400_000,
      amount: null,
      dueDate: null,
      repeat: null,
      target: null,
      targetDate: null,
      fixedAmount: null,
      months: null,
      fillMonths: null,
      schedule: null,
      asOf: "2026-03-01",
      ...saved,
    });
    const before = readMonthPlan(book.db, "2026-03-20", "2026-03");
    fillBuckets(book.db, { asOf: "2026-03-20", ...saved });
    createTransaction(book.db, {
      accountId: cash.id,
      date: "2026-03-12",
      amount: -80_000,
      payeeRaw: "Market",
      lines: [{ amount: -80_000, categoryId: groceries.id }],
      ...saved,
    });
    const after = readMonthPlan(book.db, "2026-03-20", "2026-03");
    expect(after.funding.planned).toBe(before.funding.planned);
    expect(after.funding.items.find((item) => item.bucketId === food.id)?.planned).toBe(400_000);
    expect(after.feasibility?.refills).toBe(before.feasibility?.refills);
    expect(after.funding.actual).toBe(400_000);
  } finally {
    book.close();
  }
});

test("a future month includes planned funding from earlier months", () => {
  const book = tempDatabase();
  try {
    const cash = createAccount(book.db, {
      name: "Cash",
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 0,
      paymentPolicy: null,
      ...saved,
    });
    createSchedule(book.db, {
      name: "Pay",
      kind: "income",
      accountId: cash.id,
      expectedAmount: 1_000_000,
      tolerance: 0,
      amountMode: "fixed",
      startDate: "2026-01-01",
      freq: "monthly",
      interval: 1,
      monthDay: 1,
      businessDayShift: "none",
      payday: true,
      ...saved,
    });
    const trip = createBucket(book.db, {
      name: "Trip",
      kind: "goal",
      priority: 1,
      essential: false,
      color: "lilac",
      icon: "plane",
      categoryIds: [],
      refillTo: null,
      amount: null,
      dueDate: null,
      repeat: null,
      target: 3_000,
      targetDate: "2026-04-01",
      fixedAmount: null,
      months: null,
      fillMonths: null,
      schedule: null,
      asOf: "2000-01-01",
      ...saved,
    });
    const march = readMonthPlan(book.db, "2026-01-15", "2026-03");
    expect(march.funding.items.find((item) => item.bucketId === trip.id)).toMatchObject({ planned: 1_000 });
    expect(march.feasibility).toMatchObject({ need: 1_000, refills: 0, shortfall: 0 });
  } finally {
    book.close();
  }
});

test("readMonthPlan ignores an undone month, a deleted transaction, and an archived bucket", () => {
  const book = tempDatabase();
  try {
    const cash = createAccount(book.db, {
      name: "Cash",
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 10_000_000,
      paymentPolicy: null,
      ...saved,
    });
    const pay = createCategory(book.db, { name: "Pay", kind: "income", ...saved });
    const plan = createSchedule(book.db, {
      name: "Pay",
      kind: "income",
      accountId: cash.id,
      expectedAmount: 500_000,
      tolerance: 0,
      amountMode: "variable",
      startDate: "2025-10-01",
      freq: "monthly",
      interval: 1,
      monthDay: 1,
      businessDayShift: "none",
      payday: true,
      ...saved,
    });
    const amounts = [1_000, 2_000, 3_000, 99_990];
    const dates = ["2025-10-01", "2025-11-01", "2025-12-01", "2026-02-01"];
    for (const [index, date] of dates.entries()) {
      const deposit = createTransaction(book.db, {
        accountId: cash.id,
        date,
        amount: amounts[index] ?? 0,
        payeeRaw: "Payroll",
        lines: [{ amount: amounts[index] ?? 0, categoryId: pay.id }],
        ...saved,
      });
      linkOccurrence(book.db, plan.id, date, deposit.id, saved);
      if (date === "2026-02-01") {
        deleteTransaction(book.db, deposit.id, saved);
      }
    }
    const trip = createBucket(book.db, {
      name: "Trip",
      kind: "goal",
      priority: 1,
      essential: false,
      color: "lilac",
      icon: "plane",
      categoryIds: [],
      refillTo: null,
      amount: null,
      dueDate: null,
      repeat: null,
      target: 100_000,
      targetDate: null,
      fixedAmount: 10_000,
      months: null,
      fillMonths: null,
      schedule: null,
      asOf: "2026-03-01",
      ...saved,
    });
    const marchPay = createTransaction(book.db, {
      accountId: cash.id,
      date: "2026-03-01",
      amount: 500_000,
      payeeRaw: "Payroll",
      lines: [{ amount: 500_000, categoryId: pay.id }],
      ...saved,
    });
    linkOccurrence(book.db, plan.id, "2026-03-01", marchPay.id, saved);
    fillBuckets(book.db, { asOf: "2026-03-20", ...saved });
    expect(readMonthPlan(book.db, "2026-03-20", "2026-03").funding.actual).toBe(10_000);
    undoMonthFunding(book.db, "2026-03", saved);
    const old = createBucket(book.db, {
      name: "Old",
      kind: "spending",
      priority: 2,
      essential: false,
      color: "sky",
      icon: "wallet",
      categoryIds: [],
      refillTo: 20_000,
      amount: null,
      dueDate: null,
      repeat: null,
      target: null,
      targetDate: null,
      fixedAmount: null,
      months: null,
      fillMonths: null,
      schedule: null,
      asOf: "2000-01-01",
      ...saved,
    });
    createBucketEvent(book.db, old.id, { kind: "fund", amount: 20_000, date: "2026-03-04", asOf: "2026-03-20", ...saved });
    createBucketEvent(book.db, old.id, { kind: "release", amount: 20_000, date: "2026-03-04", asOf: "2026-03-20", ...saved });
    archiveBucket(book.db, old.id, saved);

    const month = readMonthPlan(book.db, "2026-03-20", "2026-03");
    expect(month.income.planned).toBe(2_500);
    expect(month.income.actual).toBe(500_000);
    expect(month.funding.actual).toBe(0);
    expect(month.funding.items.some((item) => item.bucketId === old.id)).toBe(false);
    expect(month.funding.items.find((item) => item.bucketId === trip.id)?.actual).toBe(0);
  } finally {
    book.close();
  }
});

test("an invalid month returns month_invalid", async () => {
  const book = tempDatabase();
  try {
    expectCode(() => readMonthPlan(book.db, "2026-03-20", "2026-13"), "month_invalid");
    const app = createApp(createDb(new Database(":memory:")));
    const response = await app.request("/api/plan?asOf=2026-03-20&month=2026-13");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "month_invalid", params: { month: "2026-13" } });
  } finally {
    book.close();
  }
});
