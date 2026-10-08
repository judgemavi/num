import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { merchants, migrateDatabase, openDatabase, recurringPlans, rules, settings, transactionLines, transactions } from "@num/db";
import { storedPayee } from "@num/shared";
import { eq } from "drizzle-orm";
import { expect, test } from "bun:test";
import { createDb } from "../db";
import { ServiceError } from "../service-error";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { mergeMerchants } from "./merchant-merge";
import { applyRule, previewRuleApply } from "./rule-apply";
import { archiveMerchant, createMerchant } from "./merchants";
import { createPlan } from "./recurring-plans";
import { archiveRule, createRule, restoreRule } from "./rules";
import { listPromotionCandidates, listTransferPairs, suggestForPayee } from "./suggestions";
import { createTransaction } from "./transactions";

const at = "2026-10-07T16:00:00Z";

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-rules-"));
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

test("merge moves transactions, rules and plans, then archives the source", () => {
  const { db, close } = tempDatabase();
  try {
    const account = createAccount(db, {
      name: "Chequing",
      institution: null,
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 0,
      source: "ui",
      at,
    });
    const category = createCategory(db, { name: "Coffee", kind: "expense", source: "ui", at });
    const source = createMerchant(db, { name: "Cafe North", source: "ui", at });
    const target = createMerchant(db, { name: "Cafe South", defaultCategoryId: category.id, source: "ui", at });
    const rule = createRule(db, {
      match: "exact",
      pattern: "CAFE NORTH",
      merchantId: source.id,
      categoryId: category.id,
      priority: 1,
      source: "ui",
      at,
    });
    const plan = createPlan(db, {
      name: "Coffee",
      kind: "bill",
      accountId: account.id,
      expectedAmount: -500,
      tolerance: 0,
      amountMode: "fixed",
      merchantId: source.id,
      categoryId: category.id,
      startDate: "2026-01-15",
      freq: "monthly",
      interval: 1,
      monthDay: 15,
      businessDayShift: "none",
      active: true,
      fundsBuckets: false,
      source: "ui",
      at,
    });
    const txnId = crypto.randomUUID();
    db.insert(transactions)
      .values({
        id: txnId,
        accountId: account.id,
        date: "2026-02-01",
        amount: -500,
        merchantId: source.id,
        ...storedPayee("CAFE NORTH"),
        status: "open",
        source: "manual",
      })
      .run();
    expect(() => mergeMerchants(db, source.id, source.id, { source: "ui", at })).toThrow(ServiceError);
    const kept = mergeMerchants(db, source.id, target.id, { source: "ui", at });
    expect(kept.id).toBe(target.id);
    expect(db.select().from(transactions).where(eq(transactions.id, txnId)).get()?.merchantId).toBe(target.id);
    expect(db.select().from(rules).where(eq(rules.id, rule.id)).get()?.merchantId).toBe(target.id);
    expect(db.select().from(recurringPlans).where(eq(recurringPlans.id, plan.id)).get()?.merchantId).toBe(target.id);
    expect(db.select().from(merchants).where(eq(merchants.id, source.id)).get()?.archivedAt).toBe(at);
  } finally {
    close();
  }
});

test("restore rejects a rule whose merchant is archived", () => {
  const { db, close } = tempDatabase();
  try {
    const category = createCategory(db, { name: "Coffee", kind: "expense", source: "ui", at });
    const shop = createMerchant(db, { name: "Cafe", source: "ui", at });
    const rule = createRule(db, {
      match: "exact",
      pattern: "CAFE",
      merchantId: shop.id,
      categoryId: category.id,
      priority: 0,
      source: "ui",
      at,
    });
    archiveMerchant(db, shop.id, { source: "ui", at });
    archiveRule(db, rule.id, { source: "ui", at });
    expect(() => restoreRule(db, rule.id, { source: "ui", at })).toThrow(ServiceError);
  } finally {
    close();
  }
});

test("apply to existing skips a split and updates a single line", () => {
  const { db, close } = tempDatabase();
  try {
    const account = createAccount(db, {
      name: "Chequing",
      institution: null,
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 0,
      source: "ui",
      at,
    });
    const groceries = createCategory(db, { name: "Groceries", kind: "expense", source: "ui", at });
    const coffee = createCategory(db, { name: "Coffee", kind: "expense", source: "ui", at });
    const single = createTransaction(db, {
      accountId: account.id,
      date: "2026-04-01",
      amount: -500,
      payeeRaw: "SQ *CAFE",
      status: "open",
      lines: [{ amount: -500 }],
      source: "ui",
      at,
    });
    const split = createTransaction(db, {
      accountId: account.id,
      date: "2026-04-02",
      amount: -500,
      payeeRaw: "SQ *CAFE",
      status: "open",
      lines: [
        { amount: -300, categoryId: groceries.id },
        { amount: -200, categoryId: groceries.id },
      ],
      source: "ui",
      at,
    });
    const rule = createRule(db, {
      match: "exact",
      pattern: "CAFE",
      categoryId: coffee.id,
      priority: 1,
      source: "ui",
      at,
    });
    expect(previewRuleApply(db, rule.id).count).toBe(1);
    expect(applyRule(db, rule.id, { source: "ui", at }).count).toBe(1);
    expect(db.select().from(transactionLines).where(eq(transactionLines.transactionId, single.id)).all()[0]?.categoryId).toBe(coffee.id);
    const splitLines = db.select().from(transactionLines).where(eq(transactionLines.transactionId, split.id)).all();
    expect(splitLines.every((line) => line.categoryId === groceries.id)).toBe(true);
  } finally {
    close();
  }
});

test("promotion uses promoteAfter and a suggestion keeps its reason", () => {
  const { db, close } = tempDatabase();
  try {
    const account = createAccount(db, {
      name: "Chequing",
      institution: null,
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 0,
      source: "ui",
      at,
    });
    const savings = createAccount(db, {
      name: "Savings",
      institution: null,
      kind: "savings",
      openingDate: "2026-01-01",
      openingBalance: 0,
      source: "ui",
      at,
    });
    const category = createCategory(db, { name: "Coffee", kind: "expense", source: "ui", at });
    const shop = createMerchant(db, { name: "Cafe", defaultCategoryId: category.id, source: "ui", at });
    for (let day = 1; day <= 3; day += 1) {
      const id = crypto.randomUUID();
      db.insert(transactions)
        .values({
          id,
          accountId: account.id,
          date: `2026-03-0${day}`,
          amount: -400,
          merchantId: shop.id,
          ...storedPayee("SQ *CAFE"),
          status: "cleared",
          source: "manual",
        })
        .run();
      db.insert(transactionLines).values({ id: crypto.randomUUID(), transactionId: id, amount: -400, categoryId: category.id }).run();
    }
    expect(listPromotionCandidates(db).items).toEqual([
      { payee: "CAFE", merchantId: shop.id, categoryId: category.id, count: 3 },
    ]);
    db.insert(settings).values({ key: "promoteAfter", value: "4" }).run();
    expect(listPromotionCandidates(db).items).toEqual([]);

    createRule(db, {
      match: "exact",
      pattern: "cafe",
      accountId: account.id,
      merchantId: shop.id,
      categoryId: category.id,
      priority: 0,
      source: "ui",
      at,
    });
    expect(suggestForPayee(db, account.id, "TST*CAFE")).toEqual({
      merchantId: shop.id,
      categoryId: category.id,
      reason: "rule",
    });

    const outId = crypto.randomUUID();
    const inId = crypto.randomUUID();
    db.insert(transactions)
      .values([
        {
          id: outId,
          accountId: account.id,
          date: "2026-04-01",
          amount: -2500,
          ...storedPayee("Transfer out"),
          status: "open",
          source: "manual",
        },
        {
          id: inId,
          accountId: savings.id,
          date: "2026-04-03",
          amount: 2500,
          ...storedPayee("Transfer in"),
          status: "open",
          source: "manual",
        },
      ])
      .run();
    expect(listTransferPairs(db, "2026-04-03").items).toEqual([
      { leftId: inId < outId ? inId : outId, rightId: inId < outId ? outId : inId },
    ]);
  } finally {
    close();
  }
});
