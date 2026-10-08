import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings } from "@num/db";
import type { HygieneCheck } from "@num/shared";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { createCheckpoint } from "./checkpoints";
import { readHygiene } from "./hygiene";
import { decideInboxItem } from "./inbox-decisions";
import { linkOccurrence } from "./recurring-links";
import { createPlan } from "./recurring-plans";
import { createTransaction } from "./transactions";

const saved = { source: "ui" as const, at: "2026-04-02T16:00:00Z" };

function withBook(run: (db: Db) => void) {
  const dir = mkdtempSync(join(tmpdir(), "num-hygiene-review-"));
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

function account(db: Db, kind: "chequing" | "credit_card", name: string, openingBalance: number) {
  return createAccount(db, {
    name,
    kind,
    openingDate: "2026-01-01",
    openingBalance,
    ...(kind === "credit_card" ? { paymentPolicy: "full" as const } : {}),
    ...saved,
  });
}

function check<T extends HygieneCheck["code"]>(db: Db, asOf: string, code: T): Extract<HygieneCheck, { code: T }> {
  const found = readHygiene(db, asOf).checks.find((item) => item.code === code);
  if (!found || found.code !== code) {
    throw new Error(code);
  }
  return found as Extract<HygieneCheck, { code: T }>;
}

function changedPlan(db: Db) {
  const cash = account(db, "chequing", "Cash", 5_000);
  const food = createCategory(db, { name: "Food", kind: "expense", ...saved });
  const plan = createPlan(db, {
    name: "Stream",
    kind: "bill",
    accountId: cash.id,
    categoryId: food.id,
    expectedAmount: -1_000,
    tolerance: 0,
    amountMode: "fixed",
    startDate: "2026-01-15",
    freq: "monthly",
    interval: 1,
    monthDay: 15,
    businessDayShift: "none",
    active: true,
    fundsBuckets: false,
    ...saved,
  });
  const paid = createTransaction(db, {
    accountId: cash.id,
    date: "2026-01-15",
    amount: -1_999,
    payeeRaw: "Stream",
    status: "cleared",
    lines: [{ amount: -1_999, categoryId: food.id }],
    ...saved,
  });
  linkOccurrence(db, plan.id, "2026-01-15", paid.id, saved);
  return plan;
}

test("a changed amount fails the recurring check until keep_plan_amount", () => {
  withBook((db) => {
    const plan = changedPlan(db);
    const asOf = "2026-01-20";
    expect(check(db, asOf, "recurring")).toMatchObject({ pass: false, changed: 1, missed: 0 });
    decideInboxItem(db, asOf, `recurring_changed:${plan.id}:2026-01-15`, "keep_plan_amount", saved);
    expect(check(db, asOf, "recurring")).toMatchObject({ pass: true, changed: 0, missed: 0 });
  });
});

test("an older unpaid statement fails after a newer statement exists", () => {
  withBook((db) => {
    const card = account(db, "credit_card", "Card", -4_000);
    const food = createCategory(db, { name: "Food", kind: "expense", ...saved });
    createCheckpoint(db, card.id, { date: "2026-01-15", statementBalance: -4_000, ...saved });
    createTransaction(db, {
      accountId: card.id,
      date: "2026-02-10",
      amount: -1_000,
      payeeRaw: "Shop",
      status: "cleared",
      lines: [{ amount: -1_000, categoryId: food.id }],
      ...saved,
    });
    createCheckpoint(db, card.id, { date: "2026-02-15", statementBalance: -5_000, ...saved });
    const row = check(db, "2026-02-20", "cards_paid");
    expect(row.pass).toBe(false);
    expect(row.items[0]).toMatchObject({ statementDate: "2026-01-15", dueDate: "2026-02-05", owed: 4_000, paid: 0, pass: false });
  });
});

test("a statement dated after asOf is ignored", () => {
  withBook((db) => {
    const card = account(db, "credit_card", "Card", -1_000);
    createCheckpoint(db, card.id, { date: "2026-03-01", statementBalance: -1_000, ...saved });
    const row = check(db, "2026-02-10", "cards_paid");
    expect(row.pass).toBe(true);
    expect(row.items[0]).toMatchObject({ statementDate: null, dueDate: null, owed: 0, paid: 0, pass: true });
  });
});

test("a cash account that was never imported does not fail", () => {
  withBook((db) => {
    const cash = account(db, "chequing", "Cash", 500);
    const row = check(db, "2026-10-08", "imports_current");
    expect(row.pass).toBe(true);
    expect(row.items).toEqual([{ accountId: cash.id, lastImportDate: null, ageDays: null, pass: true }]);
  });
});
