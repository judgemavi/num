import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog, migrateDatabase, openDatabase, settings } from "@num/db";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { applyInboxGroup, createPayeeRule } from "./inbox-group";
import { listInbox } from "./inbox";
import { createMerchant } from "./merchants";
import { getRule } from "./rules";
import { createTransaction, getTransaction } from "./transactions";

const at = "2026-10-08T15:00:00Z";
const saved = { source: "ui" as const, at };

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

function pay(db: Db, accountId: string, date: string, amount: number, payee: string, merchantId: string | null = null) {
  return createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw: payee,
    merchantId,
    status: "open",
    lines: [{ amount, categoryId: null, memo: null, transferAccountId: null, tagIds: [] }],
    ...saved,
  });
}

test("a payee group applies in one write", () => {
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
    const first = pay(sample.db, cash.id, "2026-03-01", -400, "Blue Bottle");
    const second = pay(sample.db, cash.id, "2026-03-02", -420, "SQ *BLUE BOTTLE");
    const other = pay(sample.db, cash.id, "2026-03-03", -100, "Shell");
    const grouped = listInbox(sample.db, "2026-03-20").items.filter((item) => item.kind === "uncategorized");
    const bottle = grouped.find((item) => item.kind === "uncategorized" && item.payee === "BLUE BOTTLE");
    expect(bottle?.kind === "uncategorized" ? bottle.count : 0).toBe(2);
    expect(bottle?.kind === "uncategorized" ? bottle.transactionIds : []).toEqual([second.id, first.id]);

    const missing = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    expect(() =>
      applyInboxGroup(sample.db, {
        transactionIds: [first.id, missing],
        categoryId: food.id,
        transferAccountId: null,
        merchantId: null,
        source: "ui",
        at: "2026-10-08T16:00:00Z",
      }),
    ).toThrow();
    expect(getTransaction(sample.db, first.id)?.lines[0]?.categoryId).toBeNull();

    const applyAt = "2026-10-08T17:00:00Z";
    const result = applyInboxGroup(sample.db, {
      transactionIds: [first.id, second.id],
      categoryId: food.id,
      transferAccountId: null,
      merchantId: null,
      source: "ui",
      at: applyAt,
    });
    expect(result.applied).toBe(2);
    expect(getTransaction(sample.db, first.id)?.lines[0]?.categoryId).toBe(food.id);
    expect(getTransaction(sample.db, second.id)?.lines[0]?.categoryId).toBe(food.id);
    expect(getTransaction(sample.db, other.id)?.lines[0]?.categoryId).toBeNull();
    const audits = sample.db.select().from(auditLog).where(eq(auditLog.at, applyAt)).all();
    expect(audits.filter((row) => row.entity === "transactions")).toHaveLength(2);
  } finally {
    sample.close();
  }
});

test("a transfer apply clears the merchant", () => {
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
    const shop = createMerchant(sample.db, { name: "Cafe", defaultCategoryId: null, ...saved });
    const row = pay(sample.db, cash.id, "2026-03-01", -500, "Move", shop.id);
    applyInboxGroup(sample.db, {
      transactionIds: [row.id],
      categoryId: null,
      transferAccountId: savings.id,
      merchantId: shop.id,
      source: "ui",
      at: "2026-10-08T18:00:00Z",
    });
    const savedRow = getTransaction(sample.db, row.id);
    expect(savedRow?.merchantId).toBeNull();
    expect(savedRow?.lines[0]?.transferAccountId).toBe(savings.id);
    expect(savedRow?.lines[0]?.categoryId).toBeNull();
  } finally {
    sample.close();
  }
});

test("a payee rule applies to the other uncategorized rows", () => {
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
    const third = pay(sample.db, cash.id, "2026-03-03", -430, "blue bottle");
    const shell = pay(sample.db, cash.id, "2026-03-04", -100, "Shell");
    const result = createPayeeRule(sample.db, {
      payee: "BLUE BOTTLE",
      match: "contains",
      pattern: "BOTTLE",
      merchantId: null,
      categoryId: food.id,
      transferAccountId: null,
      exceptIds: [kept.id],
      source: "ui",
      at: "2026-10-08T19:00:00Z",
    });
    expect(result.applied).toBe(2);
    expect(getRule(sample.db, result.ruleId).match).toBe("contains");
    expect(getRule(sample.db, result.ruleId).pattern).toBe("BOTTLE");
    expect(getTransaction(sample.db, kept.id)?.lines[0]?.categoryId).toBeNull();
    expect(getTransaction(sample.db, other.id)?.lines[0]?.categoryId).toBe(food.id);
    expect(getTransaction(sample.db, third.id)?.lines[0]?.categoryId).toBe(food.id);
    expect(getTransaction(sample.db, shell.id)?.lines[0]?.categoryId).toBeNull();
  } finally {
    sample.close();
  }
});
