import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase } from "@num/db";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createBucketEvent } from "./bucket-events";
import { createBucket, readBucket } from "./buckets";
import { createCategory } from "./categories";
import { createFundingRun, undoFundingRun } from "./funding-runs";
import { listInbox } from "./inbox";
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
  return {
    db: createDb(sqlite),
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
    const cash = account(sample.db, 20_000);
    const dining = createCategory(sample.db, { name: "Dining", kind: "expense", essential: false, ...saved });
    const meals = createBucket(sample.db, {
      name: "Meals",
      kind: "spending",
      priority: 1,
      essential: false,
      color: "pink",
      icon: "utensils",
      categoryIds: [dining.id],
      refillTo: 1_000,
      amount: null,
      dueDate: null,
      repeat: null,
      target: null,
      targetDate: null,
      fixedAmount: null,
      ...saved,
    });
    createTransaction(sample.db, {
      accountId: cash.id,
      date: "2026-10-02",
      amount: -4_200,
      payeeRaw: "Dining out",
      status: "open",
      lines: [{ amount: -4_200, categoryId: dining.id, memo: null, transferAccountId: null, tagIds: [] }],
      ...saved,
    });
    const key = `bucket_overspent:${meals.id}:2026-10`;
    expect(listInbox(sample.db, asOf).items.some((item) => item.itemKey === key)).toBe(true);
    const event = createBucketEvent(sample.db, meals.id, { kind: "fund", amount: 4_200, date: asOf, asOf, ...saved });
    expect(event.kind).toBe("fund");
    expect(event.otherBucketId).toBeNull();
    expect(event.fundingRunId).toBeNull();
    expect(readBucket(sample.db, meals.id).balance).toBe(0);
    expect(listInbox(sample.db, asOf).items.some((item) => item.itemKey === key)).toBe(false);
  } finally {
    sample.close();
  }
});

test("a linked paycheck is an inbox item until its funding run, and returns after undo", () => {
  const sample = book();
  try {
    const cash = account(sample.db, 50_000);
    const pay = createCategory(sample.db, { name: "Pay", kind: "income", essential: false, ...saved });
    const plan = createPlan(sample.db, {
      name: "Pay",
      kind: "income",
      accountId: cash.id,
      expectedAmount: 50_000,
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
      amount: 50_000,
      payeeRaw: "Payroll",
      status: "open",
      lines: [{ amount: 50_000, categoryId: pay.id, memo: null, transferAccountId: null, tagIds: [] }],
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
      refillTo: 1_000,
      amount: null,
      dueDate: null,
      repeat: null,
      target: null,
      targetDate: null,
      fixedAmount: null,
      ...saved,
    });
    const key = `paycheck_funding:${deposit.id}`;
    expect(listInbox(sample.db, asOf).items.some((item) => item.kind === "paycheck_funding" && item.itemKey === key)).toBe(true);
    const run = createFundingRun(sample.db, {
      incomeTransactionId: deposit.id,
      lines: [{ bucketId: food.id, amount: 1_000 }],
      asOf,
      ...saved,
    });
    expect(listInbox(sample.db, asOf).items.some((item) => item.itemKey === key)).toBe(false);
    undoFundingRun(sample.db, run.id, saved);
    expect(listInbox(sample.db, asOf).items.some((item) => item.itemKey === key)).toBe(true);
  } finally {
    sample.close();
  }
});
