import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase } from "@num/db";
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
import { createFundingRun, undoFundingRun } from "./funding-runs";
import { readMonthPlan } from "./month-plan";
import { linkOccurrence } from "./recurring-links";
import { createPlan } from "./recurring-plans";
import { createTransaction, deleteTransaction } from "./transactions";

const saved = { source: "ui" as const, at: "2026-03-20T16:00:00Z" };

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-month-plan-"));
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
      openingBalance: 1_000_000,
      paymentPolicy: null,
      ...saved,
    });
    const groceries = createCategory(book.db, { name: "Groceries", kind: "expense", ...saved });
    createPlan(book.db, {
      name: "Pay",
      kind: "income",
      accountId: cash.id,
      expectedAmount: 100_000,
      tolerance: 0,
      amountMode: "fixed",
      startDate: "2026-03-01",
      freq: "monthly",
      interval: 1,
      monthDay: 1,
      businessDayShift: "none",
      active: true,
      fundsBuckets: true,
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
      refillTo: 40_000,
      amount: null,
      dueDate: null,
      repeat: null,
      target: null,
      targetDate: null,
      fixedAmount: null,
      asOf: "2000-01-01",
      ...saved,
    });
    const before = readMonthPlan(book.db, "2026-03-20", "2026-03");
    createBucketEvent(book.db, food.id, { kind: "fund", amount: 15_000, date: "2026-03-05", asOf: "2026-03-20", ...saved });
    createTransaction(book.db, {
      accountId: cash.id,
      date: "2026-03-12",
      amount: -8_000,
      payeeRaw: "Market",
      status: "open",
      lines: [{ amount: -8_000, categoryId: groceries.id }],
      ...saved,
    });
    const after = readMonthPlan(book.db, "2026-03-20", "2026-03");
    expect(after.funding.planned).toBe(before.funding.planned);
    expect(after.funding.items.find((item) => item.bucketId === food.id)?.planned).toBe(40_000);
    expect(after.feasibility?.refillsEach).toBe(before.feasibility?.refillsEach);
    expect(after.funding.actual).toBe(15_000);
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
    createPlan(book.db, {
      name: "Pay",
      kind: "income",
      accountId: cash.id,
      expectedAmount: 100_000,
      tolerance: 0,
      amountMode: "fixed",
      startDate: "2026-01-01",
      freq: "monthly",
      interval: 1,
      monthDay: 1,
      businessDayShift: "none",
      active: true,
      fundsBuckets: true,
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
      target: 300,
      targetDate: "2026-04-01",
      fixedAmount: null,
      asOf: "2000-01-01",
      ...saved,
    });
    const march = readMonthPlan(book.db, "2026-01-15", "2026-03");
    expect(march.funding.items.find((item) => item.bucketId === trip.id)).toMatchObject({ perPaycheck: 100, planned: 100 });
    expect(march.feasibility).toMatchObject({ need: 100, refillsEach: 0, shortfall: 0 });
  } finally {
    book.close();
  }
});

test("readMonthPlan ignores an undone run, a deleted transaction, and an archived bucket", () => {
  const book = tempDatabase();
  try {
    const cash = createAccount(book.db, {
      name: "Cash",
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 1_000_000,
      paymentPolicy: null,
      ...saved,
    });
    const pay = createCategory(book.db, { name: "Pay", kind: "income", ...saved });
    const plan = createPlan(book.db, {
      name: "Pay",
      kind: "income",
      accountId: cash.id,
      expectedAmount: 50_000,
      tolerance: 0,
      amountMode: "variable",
      startDate: "2025-10-01",
      freq: "monthly",
      interval: 1,
      monthDay: 1,
      businessDayShift: "none",
      active: true,
      fundsBuckets: true,
      ...saved,
    });
    const amounts = [100, 200, 300, 9_999];
    const dates = ["2025-10-01", "2025-11-01", "2025-12-01", "2026-02-01"];
    for (const [index, date] of dates.entries()) {
      const deposit = createTransaction(book.db, {
        accountId: cash.id,
        date,
        amount: amounts[index] ?? 0,
        payeeRaw: "Payroll",
        status: "open",
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
      target: 10_000,
      targetDate: null,
      fixedAmount: 1_000,
      asOf: "2000-01-01",
      ...saved,
    });
    const marchPay = createTransaction(book.db, {
      accountId: cash.id,
      date: "2026-03-01",
      amount: 50_000,
      payeeRaw: "Payroll",
      status: "open",
      lines: [{ amount: 50_000, categoryId: pay.id }],
      ...saved,
    });
    linkOccurrence(book.db, plan.id, "2026-03-01", marchPay.id, saved);
    const run = createFundingRun(book.db, {
      incomeTransactionId: marchPay.id,
      lines: [{ bucketId: trip.id, amount: 1_000 }],
      asOf: "2026-03-20",
      ...saved,
    });
    undoFundingRun(book.db, run.id, saved);
    const old = createBucket(book.db, {
      name: "Old",
      kind: "spending",
      priority: 2,
      essential: false,
      color: "sky",
      icon: "wallet",
      categoryIds: [],
      refillTo: 2_000,
      amount: null,
      dueDate: null,
      repeat: null,
      target: null,
      targetDate: null,
      fixedAmount: null,
      asOf: "2000-01-01",
      ...saved,
    });
    createBucketEvent(book.db, old.id, { kind: "fund", amount: 2_000, date: "2026-03-04", asOf: "2026-03-20", ...saved });
    createBucketEvent(book.db, old.id, { kind: "release", amount: 2_000, date: "2026-03-04", asOf: "2026-03-20", ...saved });
    archiveBucket(book.db, old.id, saved);

    const month = readMonthPlan(book.db, "2026-03-20", "2026-03");
    expect(month.income.planned).toBe(250);
    expect(month.income.actual).toBe(50_000);
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
