import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings } from "@num/db";
import { columnMapSchema, type ColumnMap } from "@num/shared";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createBucketEvent } from "./bucket-events";
import { archiveBucket, createBucket } from "./buckets";
import { createCategory } from "./categories";
import { fillBuckets } from "./funding-fill";
import { emergency } from "./funding-test-book";
import { importStatement } from "./imports";
import { needsYouChecks, type NeedsYouCheck } from "./needs-you-checks";
import { createSchedule } from "./schedule-test-book";
import { createTransaction } from "./transactions";

const at = "2026-04-02T16:00:00Z";
const saved = { source: "ui" as const, at };

const map: ColumnMap = columnMapSchema.parse({
  hasHeader: true,
  date: 0,
  description: 1,
  amount: 2,
  dateOrder: "mdy",
  signConvention: "account",
});

function withBook(run: (db: Db) => void) {
  const dir = mkdtempSync(join(tmpdir(), "num-needs-you-checks-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "USD" }).run();
  try {
    run(db);
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function account(db: Db, kind: "chequing" | "savings" | "credit_card" | "investment", name: string, openingBalance: number) {
  return createAccount(db, {
    asOf: "2026-10-07",
    name,
    kind,
    openingDate: "2026-01-01",
    openingBalance,
    ...(kind === "credit_card" ? { paymentPolicy: "full" as const } : {}),
    ...saved,
  });
}

function expense(db: Db, name: string) {
  return createCategory(db, { name, kind: "expense", ...saved });
}

function check<T extends NeedsYouCheck["code"]>(db: Db, asOf: string, code: T) {
  const found = needsYouChecks(db, asOf).find((item): item is Extract<NeedsYouCheck, { code: T }> => item.code === code);
  if (!found) {
    throw new Error(code);
  }
  return found;
}

function bill(db: Db, accountId: string, categoryId: string | null, freq: "monthly" | "yearly") {
  return createSchedule(db, {
    name: freq === "yearly" ? "Insurance" : "Rent",
    kind: "commitment",
    accountId,
    categoryId,
    expectedAmount: freq === "yearly" ? -120_000 : -10_000,
    tolerance: 0,
    amountMode: "fixed",
    startDate: freq === "yearly" ? "2026-06-15" : "2026-01-15",
    freq,
    interval: 1,
    monthDay: freq === "yearly" ? 15 : 15,
    businessDayShift: "none",
    ...saved,
  });
}

function post(db: Db, accountId: string, date: string, amount: number, categoryId: string) {
  createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw: amount > 0 ? "Pay" : "Shop",
    lines: [{ amount, categoryId }],
    ...saved,
  });
}

function spendBucket(db: Db, categoryId: string, essential: boolean, refillTo: number) {
  return createBucket(db, {
    name: essential ? "Groceries" : "Other",
    kind: "spending",
    priority: 1,
    essential,
    color: "mint",
    icon: "shopping-cart",
    categoryIds: [categoryId],
    refillTo,
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
}

function emergencyBook(db: Db) {
  const cash = account(db, "chequing", "Cash", 50_000);
  const food = expense(db, "Food");
  spendBucket(db, food.id, true, 2_000);
  bill(db, cash.id, null, "monthly");
  return emergency(db, 1);
}

test("the emergency fund passes when the bucket balance reaches its target", () => {
  withBook((db) => {
    const fund = emergencyBook(db);
    createBucketEvent(db, fund.id, { kind: "fund", amount: 12_000, date: "2026-06-15", asOf: "2026-06-15", ...saved });
    const row = check(db, "2026-06-15", "emergency_fund");
    expect(row).toMatchObject({ pass: true, balance: 12_000, target: 12_000, months: 1 });
  });
});

test("the emergency fund fails when the bucket balance is below its target", () => {
  withBook((db) => {
    const fund = emergencyBook(db);
    createBucketEvent(db, fund.id, { kind: "fund", amount: 11_990, date: "2026-06-15", asOf: "2026-06-15", ...saved });
    expect(check(db, "2026-06-15", "emergency_fund")).toMatchObject({ pass: false, balance: 11_990, target: 12_000 });
  });
});

test("an archived emergency bucket has no emergency fund check", () => {
  withBook((db) => {
    const fund = emergencyBook(db);
    archiveBucket(db, fund.id, saved);
    expect(needsYouChecks(db, "2026-06-15").map((item) => item.code)).not.toContain("emergency_fund");
  });
});

test("imports pass when each on-budget account was imported inside the stale window", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 0);
    account(db, "investment", "Funds", 0);
    const result = importStatement(db, { asOf: "2026-10-08",
      ...saved,
      at: "2026-10-08T12:00:00Z",
      accountId: cash.id,
      filename: "oct.csv",
      bytes: new TextEncoder().encode("date,description,amount\n10/01/2026,SHOP,-1.00\n"),
      columnMap: map,
    });
    expect(result.kind).toBe("batch");
    const row = check(db, "2026-10-08", "imports_current");
    expect(row.pass).toBe(true);
    expect(row.items).toEqual([{ accountId: cash.id, ageDays: 0, pass: true }]);
  });
});

test("imports fail when an on-budget account has no recent import", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 0);
    importStatement(db, { asOf: "2026-09-01",
      ...saved,
      at: "2026-09-01T12:00:00Z",
      accountId: cash.id,
      filename: "sep.csv",
      bytes: new TextEncoder().encode("date,description,amount\n09/01/2026,SHOP,-1.00\n"),
      columnMap: map,
    });
    importStatement(db, { asOf: "2026-10-20",
      ...saved,
      at: "2026-10-20T12:00:00Z",
      accountId: cash.id,
      filename: "later.csv",
      bytes: new TextEncoder().encode("date,description,amount\n10/20/2026,SHOP,-2.00\n"),
      columnMap: map,
    });
    const row = check(db, "2026-10-08", "imports_current");
    expect(row.pass).toBe(false);
    expect(row.items[0]?.pass).toBe(false);
    expect(row.items[0]?.ageDays).toBe(37);
  });
});
test("review passes when each transaction that needs review is 7 days old or less", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 1_000);
    createTransaction(db, {
      accountId: cash.id,
      date: "2026-01-28",
      amount: -100,
      payeeRaw: "Shop",
      lines: [{ amount: -100 }],
      ...saved,
    });
    expect(check(db, "2026-02-01", "review")).toMatchObject({ pass: true, oldCount: 0 });
  });
});

test("review fails when a transaction needs review for more than 7 days", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 1_000);
    createTransaction(db, {
      accountId: cash.id,
      date: "2026-01-01",
      amount: -100,
      payeeRaw: "Shop",
      lines: [{ amount: -100 }],
      ...saved,
    });
    expect(check(db, "2026-02-01", "review")).toMatchObject({ pass: false, oldCount: 1 });
  });
});

test("the savings rate uses the last 3 complete months: not older months, not the month of asOf", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 0);
    const pay = createCategory(db, { name: "Pay", kind: "income", ...saved });
    const food = expense(db, "Food");
    for (const month of ["2025-12", "2026-01", "2026-02", "2026-03"]) {
      post(db, cash.id, `${month}-05`, 10_000, pay.id);
    }
    post(db, cash.id, "2025-12-06", -40_000, food.id);
    post(db, cash.id, "2026-04-05", -50_000, food.id);
    const row = check(db, "2026-04-30", "savings_rate");
    expect(row.pass).toBe(true);
    expect(row.savingsRateMilliPct).toBe(100_000);
    const next = check(db, "2026-05-01", "savings_rate");
    expect(next.pass).toBe(false);
    expect(next.savingsRateMilliPct).toBe(-150_000);
  });
});

test("the savings rate fails when total spending exceeds total income over 3 complete months", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 0);
    const pay = createCategory(db, { name: "Pay", kind: "income", ...saved });
    const food = expense(db, "Food");
    for (const month of ["2026-01", "2026-02"]) {
      post(db, cash.id, `${month}-05`, 10_000, pay.id);
    }
    post(db, cash.id, "2026-03-05", -30_000, food.id);
    const row = check(db, "2026-04-15", "savings_rate");
    expect(row.pass).toBe(false);
    expect(row.savingsRateMilliPct).toBe(-50_000);
  });
});

test("the savings rate does not count months before the first transaction", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 0);
    const pay = createCategory(db, { name: "Pay", kind: "income", ...saved });
    const food = expense(db, "Food");
    post(db, cash.id, "2026-03-05", 10_000, pay.id);
    post(db, cash.id, "2026-03-06", -2_500, food.id);
    expect(check(db, "2026-03-20", "savings_rate")).toMatchObject({ pass: true, savingsRateMilliPct: null });
    expect(check(db, "2026-04-15", "savings_rate").savingsRateMilliPct).toBe(75_000);
  });
});

test("overspent passes when every bucket balance is zero or more", () => {
  withBook((db) => {
    const food = expense(db, "Food");
    spendBucket(db, food.id, false, 10_000);
    expect(check(db, "2026-04-02", "overspent")).toMatchObject({ pass: true, count: 0, balance: 0 });
  });
});

test("overspent fails while a bucket is negative, and passes after the fill covers it from Unassigned", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 500);
    const food = expense(db, "Food");
    spendBucket(db, food.id, false, 10_000);
    post(db, cash.id, "2026-03-02", -400, food.id);
    expect(check(db, "2026-04-02", "overspent")).toMatchObject({ pass: false, count: 1, balance: -400 });
    fillBuckets(db, { asOf: "2026-04-02", source: "ui", at: "2026-04-02T10:00:00Z" });
    expect(check(db, "2026-04-02", "overspent")).toMatchObject({ pass: true, count: 0 });
  });
});

test("overspent still fails after the fill when cash does not cover the bucket", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 500);
    const food = expense(db, "Food");
    spendBucket(db, food.id, false, 10_000);
    post(db, cash.id, "2026-03-02", -1_000, food.id);
    fillBuckets(db, { asOf: "2026-04-02", source: "ui", at: "2026-04-02T10:00:00Z" });
    expect(check(db, "2026-04-02", "overspent")).toMatchObject({ pass: false, count: 1, balance: -500 });
  });
});

test("overspent passes when Unassigned is below zero but no bucket is negative", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 500);
    const food = expense(db, "Food");
    const other = expense(db, "Other");
    spendBucket(db, food.id, false, 10_000);
    post(db, cash.id, "2026-03-02", -900, other.id);
    expect(check(db, "2026-04-02", "overspent")).toMatchObject({ pass: true, count: 0 });
  });
});

test("a cash account that was never imported does not fail", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 5_000);
    const row = check(db, "2026-10-08", "imports_current");
    expect(row.pass).toBe(true);
    expect(row.items).toEqual([{ accountId: cash.id, ageDays: null, pass: true }]);
  });
});

test("import age follows the supplied local date on both sides of UTC midnight", () => {
  for (const [at, importedOn] of [["2026-10-08T00:30:00Z", "2026-10-07"], ["2026-10-07T23:30:00Z", "2026-10-08"]] as const) {
    withBook((db) => {
      const cash = account(db, "chequing", "Cash", 0);
      importStatement(db, {
        source: "import", at, asOf: importedOn, accountId: cash.id,
        filename: "local.csv",
        bytes: new TextEncoder().encode("date,description,amount\n10/01/2026,SHOP,-1.00\n"), columnMap: map,
      });
      const onImportDay = check(db, importedOn, "imports_current");
      expect(onImportDay.items).toEqual([{ accountId: cash.id, ageDays: 0, pass: true }]);
      const nextDay = check(db, "2026-10-09", "imports_current");
      expect(nextDay.items[0]?.ageDays).toBe(importedOn === "2026-10-07" ? 2 : 1);
    });
  }
});


test("one negative month passes when the savings of the 3 months together are positive", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 0);
    const pay = createCategory(db, { name: "Pay", kind: "income", ...saved });
    const food = expense(db, "Food");
    for (const [month, spending] of [["2026-07", 88_000], ["2026-08", 104_000], ["2026-09", 90_000]] as const) {
      post(db, cash.id, `${month}-05`, 100_000, pay.id);
      post(db, cash.id, `${month}-06`, -spending, food.id);
    }
    expect(check(db, "2026-10-16", "savings_rate")).toMatchObject({ pass: true, savingsRateMilliPct: 6_000 });
  });
});
