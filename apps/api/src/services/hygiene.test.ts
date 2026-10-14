import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings } from "@num/db";
import { columnMapSchema, type ColumnMap, type HygieneCheck } from "@num/shared";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createBucket } from "./buckets";
import { createCategory } from "./categories";
import { createCheckpoint } from "./checkpoints";
import { readHygiene } from "./hygiene";
import { importStatement } from "./imports";
import { createPlan } from "./recurring-plans";
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

function withBook(run: (db: Db, dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "num-hygiene-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "USD" }).run();
  try {
    run(db, dir);
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function account(db: Db, kind: "chequing" | "savings" | "credit_card" | "investment", name: string, openingBalance: number) {
  return createAccount(db, {
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

function check<T extends HygieneCheck["code"]>(db: Db, asOf: string, code: T): Extract<HygieneCheck, { code: T }> {
  const found = readHygiene(db, asOf).checks.find((item) => item.code === code);
  if (!found || found.code !== code) {
    throw new Error(code);
  }
  return found as Extract<HygieneCheck, { code: T }>;
}

function bill(db: Db, accountId: string, categoryId: string | null, freq: "monthly" | "yearly") {
  return createPlan(db, {
    name: freq === "yearly" ? "Insurance" : "Rent",
    kind: "bill",
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
    active: true,
    fundsBuckets: false,
    ...saved,
  });
}

function post(db: Db, accountId: string, date: string, amount: number, categoryId: string) {
  createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw: amount > 0 ? "Pay" : "Shop",
    status: "cleared",
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
    asOf: "2000-01-01",
    ...saved,
  });
}

test("the emergency fund passes when savings cover one month of bills and essential refills", () => {
  withBook((db) => {
    db.insert(settings).values({ key: "emergencyFundMonths", value: "1" }).run();
    const cash = account(db, "chequing", "Cash", 0);
    account(db, "savings", "Reserve", 12_000);
    const food = expense(db, "Food");
    spendBucket(db, food.id, true, 2_000);
    bill(db, cash.id, null, "monthly");
    const row = check(db, "2026-06-15", "emergency_fund");
    expect(row).toMatchObject({ pass: true, source: "savings", held: 12_000, months: 1, monthlyBills: 10_000, monthlyRefills: 2_000, need: 12_000 });
  });
});

test("the emergency fund fails when an essential goal is short, even if savings are large", () => {
  withBook((db) => {
    db.insert(settings).values({ key: "emergencyFundMonths", value: "1" }).run();
    const cash = account(db, "chequing", "Cash", 0);
    account(db, "savings", "Reserve", 500_000);
    const food = expense(db, "Food");
    spendBucket(db, food.id, true, 2_000);
    bill(db, cash.id, null, "monthly");
    createBucket(db, {
      name: "Reserve goal",
      kind: "goal",
      priority: 1,
      essential: true,
      color: "teal",
      icon: "shield",
      categoryIds: [],
      refillTo: null,
      amount: null,
      dueDate: null,
      repeat: null,
      target: 100_000,
      targetDate: "2027-01-01",
      fixedAmount: null,
      asOf: "2000-01-01",
      ...saved,
    });
    const row = check(db, "2026-06-15", "emergency_fund");
    expect(row).toMatchObject({ pass: false, source: "goals", held: 0, need: 12_000 });
  });
});

test("a full card passes when the last statement is paid by the derived due date", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 100_000);
    const card = account(db, "credit_card", "Card", -40_000);
    createCheckpoint(db, card.id, { date: "2026-01-15", statementBalance: -40_000, ...saved });
    createTransaction(db, {
      accountId: cash.id,
      date: "2026-01-20",
      amount: -40_000,
      payeeRaw: "Card payment",
      status: "cleared",
      lines: [{ amount: -40_000, transferAccountId: card.id }],
      ...saved,
    });
    const row = check(db, "2026-02-10", "cards_paid");
    expect(row.pass).toBe(true);
    expect(row.items[0]).toMatchObject({ accountId: card.id, statementDate: "2026-01-15", dueDate: "2026-02-05", owed: 40_000, paid: 40_000, pass: true });
  });
});

test("a full card fails when the statement is still unpaid after the derived due date", () => {
  withBook((db) => {
    const card = account(db, "credit_card", "Card", -40_000);
    createCheckpoint(db, card.id, { date: "2026-01-15", statementBalance: -40_000, ...saved });
    const row = check(db, "2026-02-10", "cards_paid");
    expect(row.pass).toBe(false);
    expect(row.items[0]).toMatchObject({ owed: 40_000, paid: 0, dueDate: "2026-02-05", pass: false });
  });
});

test("imports pass when each on-budget account was imported inside the stale window", () => {
  withBook((db, dir) => {
    const cash = account(db, "chequing", "Cash", 0);
    account(db, "investment", "Funds", 0);
    const result = importStatement(db, dir, {
      ...saved,
      at: "2026-10-08T12:00:00Z",
      accountId: cash.id,
      filename: "oct.csv",
      mimeType: "text/csv",
      bytes: new TextEncoder().encode("date,description,amount\n10/01/2026,SHOP,-1.00\n"),
      columnMap: map,
    });
    expect(result.kind).toBe("batch");
    const row = check(db, "2026-10-08", "imports_current");
    expect(row.pass).toBe(true);
    expect(row.items).toEqual([{ accountId: cash.id, lastImportDate: "2026-10-08", ageDays: 0, pass: true }]);
  });
});

test("imports fail when an on-budget account has no recent import", () => {
  withBook((db, dir) => {
    const cash = account(db, "chequing", "Cash", 0);
    importStatement(db, dir, {
      ...saved,
      at: "2026-09-01T12:00:00Z",
      accountId: cash.id,
      filename: "sep.csv",
      mimeType: "text/csv",
      bytes: new TextEncoder().encode("date,description,amount\n09/01/2026,SHOP,-1.00\n"),
      columnMap: map,
    });
    importStatement(db, dir, {
      ...saved,
      at: "2026-10-20T12:00:00Z",
      accountId: cash.id,
      filename: "later.csv",
      mimeType: "text/csv",
      bytes: new TextEncoder().encode("date,description,amount\n10/20/2026,SHOP,-2.00\n"),
      columnMap: map,
    });
    const row = check(db, "2026-10-08", "imports_current");
    expect(row.pass).toBe(false);
    expect(row.staleImportDays).toBe(10);
    expect(row.items[0]?.pass).toBe(false);
    expect(row.items[0]?.ageDays).toBe(37);
  });
});
test("the inbox passes when every item is within 7 days", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 1_000);
    createTransaction(db, {
      accountId: cash.id,
      date: "2026-01-28",
      amount: -100,
      payeeRaw: "Shop",
      status: "cleared",
      lines: [{ amount: -100 }],
      ...saved,
    });
    expect(check(db, "2026-02-01", "review")).toMatchObject({ pass: true, limitDays: 7, oldCount: 0, oldestDate: null });
  });
});

test("the inbox fails when an item is older than 7 days", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 1_000);
    createTransaction(db, {
      accountId: cash.id,
      date: "2026-01-01",
      amount: -100,
      payeeRaw: "Shop",
      status: "cleared",
      lines: [{ amount: -100 }],
      ...saved,
    });
    expect(check(db, "2026-02-01", "review")).toMatchObject({ pass: false, oldCount: 1, oldestDate: "2026-01-01" });
  });
});

test("sinking funds pass when each yearly bill has a sinking bucket for its category", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 0);
    const insurance = expense(db, "Insurance");
    bill(db, cash.id, insurance.id, "yearly");
    createBucket(db, {
      name: "Insurance",
      kind: "sinking",
      priority: 1,
      essential: false,
      color: "lilac",
      icon: "shield",
      categoryIds: [insurance.id],
      refillTo: null,
      amount: 120_000,
      dueDate: "2026-06-15",
      repeat: "yearly",
      target: null,
      targetDate: null,
      fixedAmount: null,
      asOf: "2000-01-01",
      ...saved,
    });
    expect(check(db, "2026-06-15", "sinking_funds")).toMatchObject({ pass: true, yearly: 1, missing: [] });
  });
});

test("sinking funds fail when a yearly bill has no sinking bucket for its category", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 0);
    const insurance = expense(db, "Insurance");
    const plan = bill(db, cash.id, insurance.id, "yearly");
    bill(db, cash.id, insurance.id, "monthly");
    const row = check(db, "2026-06-15", "sinking_funds");
    expect(row.pass).toBe(false);
    expect(row.yearly).toBe(1);
    expect(row.missing).toEqual([{ planId: plan.id, categoryId: insurance.id }]);
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
    expect(row.months).toEqual([
      { month: "2026-03", savingsRateMilliPct: 100_000, savings: 10_000 },
      { month: "2026-02", savingsRateMilliPct: 100_000, savings: 10_000 },
      { month: "2026-01", savingsRateMilliPct: 100_000, savings: 10_000 },
    ]);
    const next = check(db, "2026-05-01", "savings_rate");
    expect(next.pass).toBe(false);
    expect(next.months[0]).toEqual({ month: "2026-04", savingsRateMilliPct: null, savings: -50_000 });
  });
});

test("the savings rate fails when one of the last 3 complete months spent more than it received", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 0);
    const pay = createCategory(db, { name: "Pay", kind: "income", ...saved });
    const food = expense(db, "Food");
    for (const month of ["2026-01", "2026-02"]) {
      post(db, cash.id, `${month}-05`, 10_000, pay.id);
    }
    post(db, cash.id, "2026-03-05", -20_000, food.id);
    const row = check(db, "2026-04-15", "savings_rate");
    expect(row.pass).toBe(false);
    expect(row.months[0]).toMatchObject({ month: "2026-03", savings: -20_000, savingsRateMilliPct: null });
  });
});

test("the savings rate does not count months before the first transaction", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 0);
    const pay = createCategory(db, { name: "Pay", kind: "income", ...saved });
    const food = expense(db, "Food");
    post(db, cash.id, "2026-03-05", 10_000, pay.id);
    post(db, cash.id, "2026-03-06", -2_500, food.id);
    expect(check(db, "2026-03-20", "savings_rate")).toMatchObject({ pass: true, months: [] });
    expect(check(db, "2026-04-15", "savings_rate").months).toEqual([
      { month: "2026-03", savingsRateMilliPct: 75_000, savings: 7_500 },
    ]);
  });
});

test("recurring passes when nothing is missed", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 0);
    bill(db, cash.id, null, "monthly");
    expect(check(db, "2026-01-10", "recurring")).toMatchObject({ pass: true, missed: 0 });
  });
});
test("recurring fails when a payment was missed", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 0);
    bill(db, cash.id, null, "monthly");
    expect(check(db, "2026-02-20", "recurring")).toMatchObject({ pass: false, missed: 1 });
  });
});

test("overspent passes when every bucket balance is zero or more", () => {
  withBook((db) => {
    const food = expense(db, "Food");
    spendBucket(db, food.id, false, 10_000);
    expect(check(db, "2026-04-02", "overspent")).toMatchObject({ pass: true, count: 0, balance: 0 });
  });
});

test("overspent fails when a bucket balance is below zero", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 5_000);
    const food = expense(db, "Food");
    spendBucket(db, food.id, false, 10_000);
    post(db, cash.id, "2026-03-02", -1_000, food.id);
    expect(check(db, "2026-04-02", "overspent")).toMatchObject({ pass: false, count: 1, balance: -1_000 });
  });
});
