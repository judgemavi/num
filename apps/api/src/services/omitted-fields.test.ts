import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings } from "@num/db";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { createAccount, updateAccount } from "./accounts";
import { createBucket, updateBucket } from "./buckets";
import { createCategory } from "./categories";
import { createMerchant } from "./merchants";
import { createSchedule } from "./schedule-test-book";
import { createTransaction, updateTransaction } from "./transactions";

const saved = { source: "ui" as const, at: "2026-10-07T16:00:00Z" };

function withBook(run: (db: Db) => void) {
  const dir = mkdtempSync(join(tmpdir(), "num-omitted-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "CAD" }).run();
  try {
    run(db);
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
      openingBalance: 50_000,
      interestRateMilliPct: 2_500,
      ...saved,
    });
    const body = { name: "Rainy day 2", kind: "savings" as const, onBudget: true, ...saved };

    const kept = updateAccount(db, account.id, body);
    expect(kept.name).toBe("Rainy day 2");
    expect(kept.institution).toBe("Example Bank");
    expect(kept.openingBalance).toBe(50_000);
    expect(kept.openingDate).toBe("2026-01-01");
    expect(kept.openingAutomatic).toBe(false);
    expect(kept.interestRateMilliPct).toBe(2_500);
    expect(kept.balance).toBe(50_000);

    const cleared = updateAccount(db, account.id, { ...body, institution: null, openingDate: null, interestRateMilliPct: null });
    expect(cleared.institution).toBeNull();
    expect(cleared.openingAutomatic).toBe(true);
    expect(cleared.interestRateMilliPct).toBeNull();
    expect(cleared.openingBalance).toBe(50_000);

    expect(updateAccount(db, account.id, { ...body, openingBalance: 0 }).openingBalance).toBe(0);
  });
});

test("a kind change must clear a stored rate that the new kind does not allow", () => {
  withBook((db) => {
    const account = createAccount(db, { name: "Rainy day", kind: "savings", interestRateMilliPct: 2_500, ...saved });
    expect(() => updateAccount(db, account.id, { kind: "chequing", ...saved })).toThrow(
      expect.objectContaining({ code: "invalid_body", params: { field: "interestRateMilliPct" } }),
    );
    const changed = updateAccount(db, account.id, { kind: "chequing", interestRateMilliPct: null, ...saved });
    expect(changed.kind).toBe("chequing");
    expect(changed.interestRateMilliPct).toBeNull();
  });
});

test("the card fields are checked together on the stored card with the patch", () => {
  withBook((db) => {
    const card = createAccount(db, {
      name: "Card",
      kind: "credit_card",
      openingBalance: -20_000,
      paymentPolicy: "fixed",
      fixedPayment: 5000,
      ...saved,
    });

    const renamed = updateAccount(db, card.id, { name: "Visa", ...saved });
    expect(renamed.paymentPolicy).toBe("fixed");
    expect(renamed.fixedPayment).toBe(5000);

    expect(updateAccount(db, card.id, { fixedPayment: 7000, ...saved }).paymentPolicy).toBe("fixed");
    expect(() => updateAccount(db, card.id, { paymentPolicy: "full", ...saved })).toThrow(
      expect.objectContaining({ code: "invalid_body", params: { field: "fixedPayment" } }),
    );
    const full = updateAccount(db, card.id, { paymentPolicy: "full", fixedPayment: null, ...saved });
    expect(full.paymentPolicy).toBe("full");
    expect(full.fixedPayment).toBeNull();
    expect(() => updateAccount(db, card.id, { paymentPolicy: "fixed", ...saved })).toThrow(
      expect.objectContaining({ code: "invalid_body", params: { field: "fixedPayment" } }),
    );
  });
});

test("a patch with the opening date and the opening balance changes only these fields", () => {
  withBook((db) => {
    const card = createAccount(db, {
      name: "Card",
      institution: "Example Bank",
      kind: "credit_card",
      openingDate: "2026-01-01",
      openingBalance: -20_000,
      paymentPolicy: "fixed",
      fixedPayment: 5000,
      ...saved,
    });
    const after = updateAccount(db, card.id, { openingDate: "2025-12-01", openingBalance: -30_000, ...saved });
    expect(after).toEqual({ ...card, openingDate: "2025-12-01", openingBalance: -30_000, balance: -30_000 });
  });
});

const scheduleBody = (accountId: string) => ({
  name: "Stream",
  kind: "commitment" as const,
  accountId,
  expectedAmount: -10_000,
  tolerance: 0,
  amountMode: "fixed" as const,
  startDate: "2026-01-15",
  freq: "monthly" as const,
  interval: 1,
  businessDayShift: "none" as const,
});

test("a schedule update keeps the fields that it leaves out and replaces the schedule when it is given", () => {
  withBook((db) => {
    const account = createAccount(db, { name: "Everyday", kind: "chequing", ...saved });
    const category = createCategory(db, { name: "Example bills", kind: "expense", ...saved });
    const merchant = createMerchant(db, { name: "Example stream", ...saved });
    const commitment = createSchedule(db, {
      ...scheduleBody(account.id),
      categoryId: category.id,
      merchantId: merchant.id,
      monthDay: 15,
      endDate: "2027-01-15",
      ...saved,
    });
    const schedule = commitment.schedule;
    if (!schedule) {
      throw new Error("The commitment has a schedule");
    }

    const kept = updateBucket(db, commitment.id, { name: "Stream 2", ...saved });
    expect(kept).toEqual({ ...commitment, name: "Stream 2" });

    const cleared = updateBucket(db, commitment.id, { schedule: { ...schedule, categoryId: null, merchantId: null, monthDay: null, endDate: null }, ...saved });
    expect(cleared.schedule).toEqual({ ...schedule, categoryId: null, merchantId: null, monthDay: null, endDate: null });
  });
});

test("an income keeps `payday` when the patch leaves the schedule out, and a commitment cannot have payday", () => {
  withBook((db) => {
    const account = createAccount(db, { name: "Everyday", kind: "chequing", ...saved });
    const income = createSchedule(db, { ...scheduleBody(account.id), name: "Pay", kind: "income", expectedAmount: 3_000_000, payday: true, ...saved });
    expect(income.schedule?.payday).toBe(true);
    expect(updateBucket(db, income.id, { name: "Pay 2", ...saved }).schedule?.payday).toBe(true);
    const commitment = createSchedule(db, { ...scheduleBody(account.id), ...saved });
    expect(() => updateBucket(db, commitment.id, { schedule: { ...scheduleBody(account.id), categoryId: null, transferAccountId: null, merchantId: null, monthDay: null, endDate: null, payday: true }, ...saved })).toThrow(
      expect.objectContaining({ code: "invalid_body", params: { field: "schedule" } }),
    );
    // A commitment cannot become an income, and a plain bucket cannot get a schedule.
    expect(() => updateBucket(db, commitment.id, { kind: "income", ...saved })).toThrow();
  });
});

test("a commitment is money out and an income is money in", () => {
  withBook((db) => {
    const account = createAccount(db, { name: "Everyday", kind: "chequing", ...saved });
    const sign = expect.objectContaining({ code: "bucket_fields_invalid" });
    expect(() => createSchedule(db, { ...scheduleBody(account.id), expectedAmount: 10_000, ...saved })).toThrow(sign);
    expect(() => createSchedule(db, { ...scheduleBody(account.id), kind: "income", expectedAmount: -10_000, ...saved })).toThrow(sign);
    expect(createSchedule(db, { ...scheduleBody(account.id), kind: "income", expectedAmount: 10_000, ...saved }).schedule?.expectedAmount).toBe(10_000);
  });
});

test("a schedule patch is checked with the stored fields that it leaves out", () => {
  withBook((db) => {
    const account = createAccount(db, { name: "Everyday", kind: "chequing", ...saved });
    const commitment = createSchedule(db, { ...scheduleBody(account.id), freq: "monthly", monthDay: 15, ...saved });
    const schedule = commitment.schedule;
    if (!schedule) {
      throw new Error("The commitment has a schedule");
    }
    const patch = (fields: Partial<typeof schedule>) => updateBucket(db, commitment.id, { schedule: { ...schedule, ...fields }, ...saved });
    expect(() => patch({ freq: "weekly" })).toThrow(expect.objectContaining({ code: "invalid_body", params: { field: "schedule" } }));
    expect(patch({ freq: "weekly", monthDay: null }).schedule?.monthDay).toBeNull();
    expect(() => patch({ endDate: "2025-12-31" })).toThrow(expect.objectContaining({ code: "invalid_body", params: { field: "schedule" } }));
    expect(() => patch({ transferAccountId: account.id })).toThrow(expect.objectContaining({ code: "invalid_body", params: { field: "schedule" } }));
    expect(updateBucket(db, commitment.id, { name: "Stream 2", ...saved })).toMatchObject({ name: "Stream 2", schedule: { freq: "weekly", monthDay: null } });
  });
});

test("a transaction update keeps the merchant that it leaves out and clears it when it is null", () => {
  withBook((db) => {
    const account = createAccount(db, { name: "Everyday", kind: "chequing", ...saved });
    const merchant = createMerchant(db, { name: "Example shop", ...saved });
    const body = {
      accountId: account.id,
      date: "2026-03-01",
      amount: -5000,
      payeeRaw: "Example shop",
      lines: [{ amount: -5000 }],
      ...saved,
    };
    const created = createTransaction(db, { ...body, merchantId: merchant.id });

    const kept = updateTransaction(db, created.id, { ...body, date: "2026-03-02" });
    expect(kept.date).toBe("2026-03-02");
    expect(kept.merchantId).toBe(merchant.id);

    const cleared = updateTransaction(db, created.id, { ...body, merchantId: null });
    expect(cleared.merchantId).toBeNull();
  });
});

test("a transaction patch keeps the lines that it leaves out and checks the amount with the stored lines", () => {
  withBook((db) => {
    const account = createAccount(db, { name: "Everyday", kind: "chequing", ...saved });
    const category = createCategory(db, { name: "Example food", kind: "expense", ...saved });
    const created = createTransaction(db, {
      accountId: account.id,
      date: "2026-03-01",
      amount: -5000,
      payeeRaw: "Example shop",
      lines: [{ amount: -5000, categoryId: category.id }],
      ...saved,
    });

    const moved = updateTransaction(db, created.id, { date: "2026-03-02", ...saved });
    expect(moved.date).toBe("2026-03-02");
    expect(moved.lines.map((line) => [line.amount, line.categoryId])).toEqual([[-5000, category.id]]);

    expect(() => updateTransaction(db, created.id, { amount: -7000, ...saved })).toThrow();
    const changed = updateTransaction(db, created.id, { amount: -7000, lines: [{ amount: -7000, categoryId: category.id }], ...saved });
    expect(changed.amount).toBe(-7000);
    expect(changed.date).toBe("2026-03-02");
  });
});

test("a bucket patch is checked with the stored kind fields", () => {
  withBook((db) => {
    const bucket = createBucket(db, {
      name: "Groceries",
      kind: "spending",
      priority: 1,
      essential: true,
      color: "mint",
      icon: "shopping-cart",
      categoryIds: [],
      refillTo: 400_000,
      amount: null,
      dueDate: null,
      repeat: null,
      target: null,
      targetDate: null,
      fixedAmount: null,
      months: null,
      canRecede: null,
      schedule: null,
      asOf: "2026-03-01",
      ...saved,
    });
    expect(updateBucket(db, bucket.id, { refillTo: 500_000, ...saved })).toMatchObject({ name: "Groceries", refillTo: 500_000 });
    expect(() => updateBucket(db, bucket.id, { kind: "goal", ...saved })).toThrow(
      expect.objectContaining({ code: "invalid_body", params: { field: "kind" } }),
    );
    const goal = updateBucket(db, bucket.id, { kind: "goal", refillTo: null, target: 1_000_000, fixedAmount: 50_000, canRecede: true, essential: null, ...saved });
    expect(goal).toMatchObject({ kind: "goal", target: 1_000_000, refillTo: null, essential: null });
  });
});
