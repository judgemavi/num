import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings } from "@num/db";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createBucketEvent } from "./bucket-events";
import { createBucket, listOverspent, readBucket } from "./buckets";
import { createCategory } from "./categories";
import { listFundingPaychecks } from "./funding-paychecks";
import { createFundingRun, undoFundingRun } from "./funding-runs";
import { linkOccurrence } from "./recurring-links";
import { createPlan } from "./recurring-plans";
import { createTransaction } from "./transactions";

const at = "2026-10-07T16:00:00Z";
const saved = { source: "ui" as const, at };
const asOf = "2026-10-08";

function book() {
  const dir = mkdtempSync(join(tmpdir(), "num-inbox-fund-"));
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

function account(db: Db, openingBalance: number) {
  return createAccount(db, {
    name: "Cash",
    institution: null,
    kind: "chequing",
    openingDate: "2026-01-01",
    openingBalance,
    ...saved,
  });
}

test("cover from Unassigned uses a fund event and clears the overspent item", () => {
  const sample = book();
  try {
    const cash = account(sample.db, 200_000);
    const dining = createCategory(sample.db, { name: "Dining", kind: "expense", essential: false, ...saved });
    const meals = createBucket(sample.db, {
      name: "Meals",
      kind: "spending",
      priority: 1,
      essential: false,
      color: "pink",
      icon: "utensils",
      categoryIds: [dining.id],
      refillTo: 10_000,
      amount: null,
      dueDate: null,
      repeat: null,
      target: null,
      targetDate: null,
      fixedAmount: null,
      asOf: "2000-01-01",
      ...saved,
    });
    createTransaction(sample.db, {
      accountId: cash.id,
      date: "2026-10-02",
      amount: -42_000,
      payeeRaw: "Dining out",
      lines: [{ amount: -42_000, categoryId: dining.id, memo: null, transferAccountId: null, tagIds: [] }],
      ...saved,
    });
    expect(listOverspent(sample.db).items.some((item) => item.id === meals.id)).toBe(true);
    const event = createBucketEvent(sample.db, meals.id, { kind: "fund", amount: 42_000, date: asOf, asOf, ...saved });
    expect(event.kind).toBe("fund");
    expect(event.otherBucketId).toBeNull();
    expect(event.fundingRunId).toBeNull();
    expect(readBucket(sample.db, meals.id).balance).toBe(0);
    expect(listOverspent(sample.db).items.some((item) => item.id === meals.id)).toBe(false);
  } finally {
    sample.close();
  }
});

test("a linked paycheck is waiting for funding until its funding run, and returns after undo", () => {
  const sample = book();
  try {
    const cash = account(sample.db, 500_000);
    const pay = createCategory(sample.db, { name: "Pay", kind: "income", essential: false, ...saved });
    const plan = createPlan(sample.db, {
      name: "Pay",
      kind: "income",
      accountId: cash.id,
      expectedAmount: 500_000,
      tolerance: 0,
      amountMode: "fixed",
      startDate: "2026-10-01",
      freq: "monthly",
      interval: 1,
      monthDay: 1,
      businessDayShift: "none",
      endDate: "2026-10-01",
      active: true,
      fundsBuckets: true,
      ...saved,
    });
    const deposit = createTransaction(sample.db, {
      accountId: cash.id,
      date: "2026-10-01",
      amount: 500_000,
      payeeRaw: "Payroll",
      lines: [{ amount: 500_000, categoryId: pay.id, memo: null, transferAccountId: null, tagIds: [] }],
      ...saved,
    });
    linkOccurrence(sample.db, plan.id, "2026-10-01", deposit.id, saved);
    const food = createBucket(sample.db, {
      name: "Food",
      kind: "spending",
      priority: 1,
      essential: false,
      color: "mint",
      icon: "shopping-cart",
      categoryIds: [],
      refillTo: 10_000,
      amount: null,
      dueDate: null,
      repeat: null,
      target: null,
      targetDate: null,
      fixedAmount: null,
      asOf: "2000-01-01",
      ...saved,
    });
    const waiting = () => listFundingPaychecks(sample.db).items.some((item) => item.incomeTransactionId === deposit.id);
    expect(waiting()).toBe(true);
    const run = createFundingRun(sample.db, {
      incomeTransactionId: deposit.id,
      lines: [{ bucketId: food.id, amount: 10_000 }],
      asOf,
      ...saved,
    });
    expect(waiting()).toBe(false);
    undoFundingRun(sample.db, run.id, saved);
    expect(waiting()).toBe(true);
  } finally {
    sample.close();
  }
});
