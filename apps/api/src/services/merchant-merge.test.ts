import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { merchants, migrateDatabase, openDatabase, recurringPlans, settings, transactions } from "@num/db";
import { storedPayee } from "@num/shared";
import { eq } from "drizzle-orm";
import { expect, test } from "bun:test";
import { createDb } from "../db";
import { ServiceError } from "../service-error";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { mergeMerchants } from "./merchant-merge";
import { createMerchant } from "./merchants";
import { createPlan } from "./recurring-plans";

const at = "2026-10-07T16:00:00Z";

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-merge-"));
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

test("merge moves transactions and plans, then archives the source", () => {
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
    const target = createMerchant(db, { name: "Cafe South", source: "ui", at });
    const plan = createPlan(db, {
      name: "Coffee",
      kind: "bill",
      accountId: account.id,
      expectedAmount: -5000,
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
        amount: -5000,
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
    expect(db.select().from(recurringPlans).where(eq(recurringPlans.id, plan.id)).get()?.merchantId).toBe(target.id);
    expect(db.select().from(merchants).where(eq(merchants.id, source.id)).get()?.archivedAt).toBe(at);
  } finally {
    close();
  }
});
