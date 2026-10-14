import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase } from "@num/db";
import { expect, test } from "bun:test";
import { planCreateSchema, planUpdateSchema } from "@num/shared";
import { createDb, type Db } from "../db";
import { applyOpeningSuggestion, createAccount, updateAccount } from "./accounts";
import { createCategory } from "./categories";
import { createMerchant } from "./merchants";
import { createPlan, updatePlan } from "./recurring-plans";
import { createTransaction, updateTransaction } from "./transactions";

const saved = { source: "ui" as const, at: "2026-10-07T16:00:00Z" };

function withBook(run: (db: Db) => void) {
  const dir = mkdtempSync(join(tmpdir(), "num-omitted-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  try {
    run(createDb(sqlite));
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test("an account update keeps the fields that it leaves out and clears the fields that are null", () => {
  withBook((db) => {
    const account = createAccount(db, {
      name: "Rainy day",
      institution: "Example Bank",
      kind: "savings",
      openingDate: "2026-01-01",
      openingBalance: 5_000,
      interestRateMilliPct: 2_500,
      ...saved,
    });
    const body = { name: "Rainy day 2", kind: "savings" as const, onBudget: true, ...saved };

    const kept = updateAccount(db, account.id, body);
    expect(kept.name).toBe("Rainy day 2");
    expect(kept.institution).toBe("Example Bank");
    expect(kept.openingBalance).toBe(5_000);
    expect(kept.openingDate).toBe("2026-01-01");
    expect(kept.openingAutomatic).toBe(false);
    expect(kept.interestRateMilliPct).toBe(2_500);
    expect(kept.balance).toBe(5_000);

    const cleared = updateAccount(db, account.id, { ...body, institution: null, openingDate: null, interestRateMilliPct: null });
    expect(cleared.institution).toBeNull();
    expect(cleared.openingAutomatic).toBe(true);
    expect(cleared.interestRateMilliPct).toBeNull();
    expect(cleared.openingBalance).toBe(5_000);

    expect(updateAccount(db, account.id, { ...body, openingBalance: 0 }).openingBalance).toBe(0);
  });
});

test("a kind that has no interest rate does not keep the stored rate", () => {
  withBook((db) => {
    const account = createAccount(db, { name: "Rainy day", kind: "savings", interestRateMilliPct: 2_500, ...saved });
    const changed = updateAccount(db, account.id, { name: "Everyday", kind: "chequing", onBudget: true, ...saved });
    expect(changed.interestRateMilliPct).toBeNull();
  });
});

test("a card keeps the two card fields only when the update leaves out the two", () => {
  withBook((db) => {
    const card = createAccount(db, {
      name: "Card",
      kind: "credit_card",
      openingBalance: -2_000,
      paymentPolicy: "fixed",
      fixedPayment: 500,
      ...saved,
    });
    const body = { name: "Card", kind: "credit_card" as const, onBudget: true, ...saved };

    const kept = updateAccount(db, card.id, body);
    expect(kept.paymentPolicy).toBe("fixed");
    expect(kept.fixedPayment).toBe(500);

    const full = updateAccount(db, card.id, { ...body, paymentPolicy: "full" });
    expect(full.paymentPolicy).toBe("full");
    expect(full.fixedPayment).toBeNull();
  });
});

test("an opening suggestion changes only the opening date and the opening balance", () => {
  withBook((db) => {
    const card = createAccount(db, {
      name: "Card",
      institution: "Example Bank",
      kind: "credit_card",
      openingDate: "2026-01-01",
      openingBalance: -2_000,
      paymentPolicy: "fixed",
      fixedPayment: 500,
      ...saved,
    });
    const after = applyOpeningSuggestion(db, card.id, { date: "2025-12-01", amount: -3_000, ...saved });
    expect(after).toEqual({ ...card, openingDate: "2025-12-01", openingBalance: -3_000, balance: -3_000 });
  });
});

test("a plan update keeps the fields that it leaves out and clears the fields that are null", () => {
  withBook((db) => {
    const account = createAccount(db, { name: "Everyday", kind: "chequing", ...saved });
    const category = createCategory(db, { name: "Example bills", kind: "expense", ...saved });
    const merchant = createMerchant(db, { name: "Example stream", ...saved });
    const body = {
      name: "Stream",
      kind: "bill" as const,
      accountId: account.id,
      expectedAmount: -1_000,
      tolerance: 0,
      amountMode: "fixed" as const,
      startDate: "2026-01-15",
      freq: "monthly" as const,
      interval: 1,
      businessDayShift: "none" as const,
      active: true,
      fundsBuckets: false,
      ...saved,
    };
    const plan = createPlan(db, { ...body, categoryId: category.id, merchantId: merchant.id, monthDay: 15, endDate: "2027-01-15" });

    const kept = updatePlan(db, plan.id, { ...body, name: "Stream 2" });
    expect(kept).toEqual({ ...plan, name: "Stream 2" });

    const cleared = updatePlan(db, plan.id, { ...body, categoryId: null, merchantId: null, monthDay: null, endDate: null });
    expect(cleared).toEqual({ ...plan, categoryId: null, merchantId: null, monthDay: null, endDate: null });
  });
});

test("a plan update keeps `active` and `fundsBuckets` when it leaves them out", () => {
  withBook((db) => {
    const account = createAccount(db, { name: "Everyday", kind: "chequing", ...saved });
    const fields = {
      name: "Pay",
      kind: "income" as const,
      accountId: account.id,
      expectedAmount: 300_000,
      tolerance: 0,
      amountMode: "fixed" as const,
      startDate: "2026-01-15",
      freq: "monthly" as const,
      interval: 1,
      businessDayShift: "none" as const,
    };
    // The create schema gives the defaults. The update schema gives none.
    expect(planCreateSchema.parse(fields)).toMatchObject({ active: true, fundsBuckets: false });
    const omitted = planUpdateSchema.parse(fields);
    expect(omitted.active).toBeUndefined();
    expect(omitted.fundsBuckets).toBeUndefined();

    const plan = createPlan(db, { ...fields, active: false, fundsBuckets: true, ...saved });
    const kept = updatePlan(db, plan.id, { ...omitted, name: "Pay 2", ...saved });
    expect(kept).toEqual({ ...plan, name: "Pay 2" });

    const set = updatePlan(db, plan.id, { ...planUpdateSchema.parse({ ...fields, active: true, fundsBuckets: false }), ...saved });
    expect(set.active).toBe(true);
    expect(set.fundsBuckets).toBe(false);
    expect(updatePlan(db, plan.id, { ...omitted, ...saved })).toEqual({ ...set });

    const paused = updatePlan(db, plan.id, { ...omitted, active: false, fundsBuckets: true, ...saved });
    expect(paused.active).toBe(false);
    expect(paused.fundsBuckets).toBe(true);
    // A plan that is not income cannot fund buckets, also when the update leaves the field out.
    expect(updatePlan(db, plan.id, { ...omitted, kind: "bill", expectedAmount: -1_000, ...saved }).fundsBuckets).toBe(false);
  });
});

test("a plan that changes to weekly does not keep the stored month day", () => {
  withBook((db) => {
    const account = createAccount(db, { name: "Everyday", kind: "chequing", ...saved });
    const body = {
      name: "Stream",
      kind: "bill" as const,
      accountId: account.id,
      expectedAmount: -1_000,
      tolerance: 0,
      amountMode: "fixed" as const,
      startDate: "2026-01-15",
      interval: 1,
      businessDayShift: "none" as const,
      active: true,
      fundsBuckets: false,
      ...saved,
    };
    const plan = createPlan(db, { ...body, freq: "monthly", monthDay: 15 });
    expect(updatePlan(db, plan.id, { ...body, freq: "weekly" }).monthDay).toBeNull();
  });
});

test("a transaction update keeps the merchant and the note that it leaves out and clears them when they are null", () => {
  withBook((db) => {
    const account = createAccount(db, { name: "Everyday", kind: "chequing", ...saved });
    const merchant = createMerchant(db, { name: "Example shop", ...saved });
    const body = {
      accountId: account.id,
      date: "2026-03-01",
      amount: -500,
      payeeRaw: "Example shop",
      status: "open" as const,
      lines: [{ amount: -500 }],
      ...saved,
    };
    const created = createTransaction(db, { ...body, merchantId: merchant.id, notes: "weekly" });

    const kept = updateTransaction(db, created.id, { ...body, date: "2026-03-02" });
    expect(kept.date).toBe("2026-03-02");
    expect(kept.merchantId).toBe(merchant.id);
    expect(kept.notes).toBe("weekly");

    const cleared = updateTransaction(db, created.id, { ...body, merchantId: null, notes: null });
    expect(cleared.merchantId).toBeNull();
    expect(cleared.notes).toBeNull();
  });
});
