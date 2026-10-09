import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog, migrateDatabase, openDatabase, settings, transactions } from "@num/db";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { applyInboxGroup } from "./inbox-group";
import { createMerchant } from "./merchants";
import { createTransaction, getTransaction, updateTransaction } from "./transactions";

const at = "2026-10-08T15:00:00Z";
const saved = { source: "ui" as const, at };
const missingCategory = "99999999-9999-4999-8999-999999999999";

function book() {
  const dir = mkdtempSync(join(tmpdir(), "num-inbox-group-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "USD" }).run();
  return {
    db,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function pay(db: Db, accountId: string, date: string, amount: number, payee: string, merchantId: string | null = null, lines?: { amount: number; categoryId: string | null }[]) {
  return createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw: payee,
    merchantId,
    status: "open",
    lines: (lines ?? [{ amount, categoryId: null }]).map((line) => ({
      amount: line.amount,
      categoryId: line.categoryId,
      memo: null,
      transferAccountId: null,
      tagIds: [],
    })),
    ...saved,
  });
}

test("excluded rows stay unchanged, and a failure writes nothing", () => {
  const sample = book();
  try {
    const cash = createAccount(sample.db, {
      name: "Cash",
      institution: null,
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const food = createCategory(sample.db, { name: "Food", kind: "expense", essential: false, ...saved });
    const kept = pay(sample.db, cash.id, "2026-03-01", -400, "Blue Bottle");
    const other = pay(sample.db, cash.id, "2026-03-02", -420, "SQ *BLUE BOTTLE");
    const excluded = pay(sample.db, cash.id, "2026-03-03", -430, "blue bottle");
    const applyAt = "2026-10-08T17:00:00Z";
    expect(() =>
      applyInboxGroup(sample.db, {
        accountId: cash.id,
        transactionIds: [kept.id, excluded.id],
        excludedIds: [excluded.id],
        categoryId: missingCategory,
        transferAccountId: null,
        merchantId: null,
        source: "ui",
        at: applyAt,
      }),
    ).toThrow();
    expect(getTransaction(sample.db, kept.id)?.lines[0]?.categoryId).toBeNull();
    expect(getTransaction(sample.db, other.id)?.lines[0]?.categoryId).toBeNull();
    expect(getTransaction(sample.db, excluded.id)?.lines[0]?.categoryId).toBeNull();
    expect(sample.db.select().from(auditLog).where(eq(auditLog.at, applyAt)).all()).toHaveLength(0);

    const result = applyInboxGroup(sample.db, {
      accountId: cash.id,
      transactionIds: [kept.id, excluded.id],
      excludedIds: [excluded.id],
      categoryId: food.id,
      transferAccountId: null,
      merchantId: null,
      source: "ui",
      at: "2026-10-08T18:00:00Z",
    });
    expect(result.applied).toBe(1);
    expect(getTransaction(sample.db, kept.id)?.lines[0]?.categoryId).toBe(food.id);
    expect(getTransaction(sample.db, other.id)?.lines[0]?.categoryId).toBeNull();
    expect(getTransaction(sample.db, excluded.id)?.lines[0]?.categoryId).toBeNull();
  } finally {
    sample.close();
  }
});

test("a categorized row, a split and a reconciled transfer are skipped", () => {
  const sample = book();
  try {
    const cash = createAccount(sample.db, {
      name: "Cash",
      institution: null,
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const savings = createAccount(sample.db, {
      name: "Savings",
      institution: null,
      kind: "savings",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const food = createCategory(sample.db, { name: "Food", kind: "expense", essential: false, ...saved });
    const done = pay(sample.db, cash.id, "2026-03-02", -100, "Cafe", null, [{ amount: -100, categoryId: food.id }]);
    const open = pay(sample.db, cash.id, "2026-03-01", -400, "Cafe");
    const split = pay(sample.db, cash.id, "2026-03-03", -300, "Cafe", null, [
      { amount: -200, categoryId: null },
      { amount: -100, categoryId: null },
    ]);
    const locked = pay(sample.db, cash.id, "2026-03-04", -50, "Cafe");
    sample.db.update(transactions).set({ status: "reconciled" }).where(eq(transactions.id, locked.id)).run();
    const result = applyInboxGroup(sample.db, {
      accountId: cash.id,
      transactionIds: [open.id, done.id, split.id, locked.id],
      excludedIds: [],
      categoryId: null,
      transferAccountId: savings.id,
      merchantId: null,
      source: "ui",
      at: "2026-10-08T19:00:00Z",
    });
    expect(result.applied).toBe(1);
    expect(result.skipped.map((row) => row.reason).sort()).toEqual(["categorized", "reconciled", "split"]);
    expect(getTransaction(sample.db, open.id)?.lines[0]?.transferAccountId).toBe(savings.id);
    expect(getTransaction(sample.db, done.id)?.lines[0]?.categoryId).toBe(food.id);
    expect(getTransaction(sample.db, split.id)?.lines).toHaveLength(2);
    expect(getTransaction(sample.db, locked.id)?.lines[0]?.transferAccountId).toBeNull();
  } finally {
    sample.close();
  }
});

test("a group keeps an existing merchant and a transfer clears it on PATCH", () => {
  const sample = book();
  try {
    const cash = createAccount(sample.db, {
      name: "Cash",
      institution: null,
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const savings = createAccount(sample.db, {
      name: "Savings",
      institution: null,
      kind: "savings",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const food = createCategory(sample.db, { name: "Food", kind: "expense", essential: false, ...saved });
    const shop = createMerchant(sample.db, { name: "Cafe", defaultCategoryId: null, ...saved });
    const row = pay(sample.db, cash.id, "2026-03-01", -500, "Cafe", shop.id);
    applyInboxGroup(sample.db, {
      accountId: cash.id,
      transactionIds: [row.id],
      excludedIds: [],
      categoryId: food.id,
      transferAccountId: null,
      merchantId: null,
      source: "ui",
      at: "2026-10-08T20:00:00Z",
    });
    expect(getTransaction(sample.db, row.id)?.merchantId).toBe(shop.id);
    expect(getTransaction(sample.db, row.id)?.lines[0]?.categoryId).toBe(food.id);
    const current = getTransaction(sample.db, row.id);
    if (!current) {
      throw new Error("missing");
    }
    const transferred = updateTransaction(sample.db, row.id, {
      accountId: current.accountId,
      date: current.date,
      amount: current.amount,
      payeeRaw: current.payeeRaw,
      merchantId: shop.id,
      notes: null,
      status: "open",
      lines: [{ amount: current.amount, categoryId: null, memo: null, transferAccountId: savings.id, tagIds: [] }],
      ...saved,
    });
    expect(transferred.merchantId).toBeNull();
    expect(transferred.lines[0]?.transferAccountId).toBe(savings.id);
  } finally {
    sample.close();
  }
});

test("saving one transaction does not fill a split", () => {
  const sample = book();
  try {
    const cash = createAccount(sample.db, {
      name: "Cash",
      institution: null,
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const food = createCategory(sample.db, { name: "Food", kind: "expense", essential: false, ...saved });
    const current = pay(sample.db, cash.id, "2026-03-01", -400, "Blue Bottle");
    const other = pay(sample.db, cash.id, "2026-03-02", -420, "SQ *BLUE BOTTLE");
    const split = pay(sample.db, cash.id, "2026-03-03", -300, "blue bottle", null, [
      { amount: -200, categoryId: null },
      { amount: -100, categoryId: null },
    ]);
    const ruleAt = "2026-10-08T21:00:00Z";
    expect(() =>
      updateTransaction(sample.db, current.id, {
        accountId: cash.id,
        date: current.date,
        amount: current.amount,
        payeeRaw: current.payeeRaw,
        merchantId: null,
        notes: null,
        status: "open",
        lines: [{ amount: current.amount, categoryId: missingCategory, memo: null, transferAccountId: null, tagIds: [] }],
        source: "ui",
        at: ruleAt,
      }),
    ).toThrow();
    expect(getTransaction(sample.db, current.id)?.lines[0]?.categoryId).toBeNull();
    expect(getTransaction(sample.db, other.id)?.lines[0]?.categoryId).toBeNull();
    expect(sample.db.select().from(auditLog).where(eq(auditLog.at, ruleAt)).all()).toHaveLength(0);

    const savedRow = updateTransaction(sample.db, current.id, {
      accountId: cash.id,
      date: current.date,
      amount: current.amount,
      payeeRaw: current.payeeRaw,
      merchantId: null,
      notes: null,
      status: "open",
      lines: [{ amount: current.amount, categoryId: food.id, memo: null, transferAccountId: null, tagIds: [] }],
      source: "ui",
      at: "2026-10-08T22:00:00Z",
    });
    expect(savedRow.lines[0]?.categoryId).toBe(food.id);
    expect(getTransaction(sample.db, other.id)?.lines[0]?.categoryId).toBeNull();
    expect(getTransaction(sample.db, split.id)?.lines.every((line) => line.categoryId === null)).toBe(true);
  } finally {
    sample.close();
  }
});
