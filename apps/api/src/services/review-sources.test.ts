import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog, importRows, merchants, migrateDatabase, occurrenceLinks, openDatabase, settings, transactions } from "@num/db";
import { columnMapSchema, foldName, type ColumnMap } from "@num/shared";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createBucketEvent } from "./bucket-events";
import { createBucket, listOverspent, updateBucket } from "./buckets";
import { createCategory } from "./categories";
import { getImportDetail } from "./import-list";
import { undoImportBatch } from "./import-undo";
import { importStatement } from "./imports";
import { resolveImportReview } from "./import-review";
import { decideInboxItem } from "./inbox-decisions";
import { listNeedsReview } from "./needs-review";
import { openUnreadableKeys } from "./book-settings";
import { recurringSignals } from "./recurring-view";
import { createSchedule } from "./schedule-test-book";
import { linkOccurrence, skipOccurrence } from "./recurring-links";
import { acceptTransferPair, listTransferPairs } from "./suggestions";
import { createTransaction, getTransaction, updateTransaction } from "./transactions";

const at = "2026-10-07T16:00:00Z";
const saved = { source: "ui" as const, at };
const asOf = "2026-03-20";

const map: ColumnMap = columnMapSchema.parse({
  hasHeader: true,
  date: 0,
  description: 1,
  amount: 2,
  dateOrder: "mdy",
  signConvention: "account",
  decimalSeparator: ".",
});

function book() {
  const dir = mkdtempSync(join(tmpdir(), "num-inbox-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "USD" }).run();
  return {
    dir,
    db,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function account(db: Db, name: string) {
  return createAccount(db, {
    asOf: "2026-10-07",
    name,
    institution: null,
    kind: "chequing",
    openingDate: "2026-01-01",
    openingBalance: 10_000_000,
    ...saved,
  });
}

function category(db: Db, name: string) {
  return createCategory(db, { name, kind: "expense", ...saved });
}

function merchant(db: Db, name: string) {
  const id = crypto.randomUUID();
  db.insert(merchants).values({ id, name, sortKey: foldName(name), archivedAt: null }).run();
  return id;
}

function pay(db: Db, accountId: string, date: string, amount: number, payee: string, categoryId: string | null, merchantId: string | null = null) {
  return createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw: payee,
    merchantId,
    lines: [{ amount, categoryId, memo: null, transferAccountId: null, tagIds: [] }],
    ...saved,
  });
}

function openCount(db: Db): number {
  return db.select({ id: transactions.id }).from(transactions).all().length;
}

function questionIds(db: Db): string[] {
  return listNeedsReview(db, asOf)
    .filter((hit) => hit.review.question === "categorize" && hit.review.level === "none")
    .map((hit) => hit.id);
}

function pairKeys(db: Db): string[] {
  return listTransferPairs(db, asOf).items.map((pair) =>
    pair.leftId < pair.rightId ? `transfer_pair:${pair.leftId}:${pair.rightId}` : `transfer_pair:${pair.rightId}:${pair.leftId}`,
  );
}

function overspentIds(db: Db): string[] {
  return listOverspent(db).items.map((item) => item.id);
}

function dueKeys(items: { bucketId: string; dueDate: string }[]): string[] {
  return items.map((item) => `${item.bucketId}:${item.dueDate}`);
}

function reviewRowIds(db: Db, batchId: string): string[] {
  return getImportDetail(db, batchId).rows.filter((row) => row.outcome === "needs_review").map((row) => row.id);
}

function planFields(accountId: string, merchantId: string | null, expectedAmount: number, startDate: string) {
  return {
    name: "Stream",
    kind: "commitment" as const,
    accountId,
    expectedAmount,
    tolerance: 0,
    amountMode: "fixed" as const,
    categoryId: null,
    transferAccountId: null,
    merchantId,
    startDate,
    freq: "monthly" as const,
    interval: 1,
    monthDay: 15,
    businessDayShift: "none" as const,
    endDate: startDate,
  };
}

test("each review source appears and leaves after its action", () => {
  const sample = book();
  try {
    const cash = account(sample.db, "Cash");
    const savings = account(sample.db, "Savings");
    const food = category(sample.db, "Food");
    const dining = category(sample.db, "Dining");
    const stream = merchant(sample.db, "Stream Co");

    const open = pay(sample.db, cash.id, "2026-03-02", -64000, "Corner market", null);
    expect(questionIds(sample.db)).toEqual([open.id]);
    updateTransaction(sample.db, open.id, {
      accountId: open.accountId,
      date: open.date,
      amount: open.amount,
      payeeRaw: open.payeeRaw,
      merchantId: open.merchantId,
      lines: [{ amount: open.amount, categoryId: food.id, memo: null, transferAccountId: null, tagIds: [] }],
      ...saved,
    });
    expect(questionIds(sample.db)).toEqual([]);

    const left = pay(sample.db, cash.id, "2026-03-05", -500000, "Move", food.id);
    sample.db.update(transactions).set({ source: "import" }).where(eq(transactions.id, left.id)).run();
    const right = pay(sample.db, savings.id, "2026-03-06", 500000, "Move", food.id);
    const pairKey = left.id < right.id ? `transfer_pair:${left.id}:${right.id}` : `transfer_pair:${right.id}:${left.id}`;
    expect(pairKeys(sample.db)).toEqual([pairKey]);
    const beforePair = openCount(sample.db);
    acceptTransferPair(sample.db, asOf, left.id, right.id, saved);
    expect(openCount(sample.db)).toBe(beforePair);
    expect(getTransaction(sample.db, left.id)?.lines).toEqual([
      expect.objectContaining({ transferAccountId: right.accountId }),
    ]);
    expect(getTransaction(sample.db, right.id)?.lines).toEqual([
      expect.objectContaining({ transferAccountId: left.accountId }),
    ]);
    expect(pairKeys(sample.db)).toEqual([]);

    const meals = createBucket(sample.db, {
      name: "Meals",
      kind: "spending",
      priority: 1,
      essential: false,
      color: "pink",
      icon: "utensils",
      categoryIds: [dining.id],
      refillTo: 10000,
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
    const spare = createBucket(sample.db, {
      name: "Spare",
      kind: "spending",
      priority: 2,
      essential: false,
      color: "mint",
      icon: "wallet",
      categoryIds: [],
      refillTo: 10000,
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
    pay(sample.db, cash.id, "2026-03-08", -42000, "Dining out", dining.id);
    createBucketEvent(sample.db, spare.id, { kind: "fund", amount: 50000, date: "2026-03-01", asOf, ...saved });
    expect(overspentIds(sample.db)).toEqual([meals.id]);
    createBucketEvent(sample.db, spare.id, { kind: "move", otherBucketId: meals.id, amount: 42_000, date: asOf, ...saved });
    expect(overspentIds(sample.db)).toEqual([]);

    const changedPlan = createSchedule(sample.db, { ...planFields(cash.id, null, -10000, "2026-03-15"), ...saved });
    const changedPay = pay(sample.db, cash.id, "2026-03-15", -19990, "Stream", food.id);
    linkOccurrence(sample.db, changedPlan.id, "2026-03-15", changedPay.id, saved);
    expect(dueKeys(recurringSignals(sample.db, asOf).changed)).toEqual([`${changedPlan.id}:2026-03-15`]);
    const { name: _name, kind: _kind, ...raised } = planFields(cash.id, null, -19990, "2026-03-15");
    updateBucket(sample.db, changedPlan.id, { schedule: raised, ...saved });
    expect(recurringSignals(sample.db, asOf).changed).toEqual([]);

    const missedPlan = createSchedule(sample.db, { ...planFields(cash.id, null, -10000, "2026-01-15"), endDate: null, name: "Gym", ...saved });
    expect(dueKeys(recurringSignals(sample.db, asOf).missed)).toContain(`${missedPlan.id}:2026-02-15`);
    skipOccurrence(sample.db, missedPlan.id, "2026-02-15", "Closed", saved);
    expect(dueKeys(recurringSignals(sample.db, asOf).missed)).not.toContain(`${missedPlan.id}:2026-02-15`);

    const ambiguousPlan = createSchedule(sample.db, { ...planFields(savings.id, null, -10000, "2026-03-15"), name: "Phone", ...saved });
    const first = pay(sample.db, savings.id, "2026-03-14", -10000, "Phone a", food.id);
    const second = pay(sample.db, savings.id, "2026-03-16", -10000, "Phone b", food.id);
    expect(dueKeys(recurringSignals(sample.db, asOf).ambiguous)).toEqual([`${ambiguousPlan.id}:2026-03-15`]);
    linkOccurrence(sample.db, ambiguousPlan.id, "2026-03-15", first.id, saved);
    expect(recurringSignals(sample.db, asOf).ambiguous).toEqual([]);
    expect(second.id).not.toBe(first.id);

    for (const date of ["2026-01-15", "2026-02-15", "2026-03-15"]) {
      pay(sample.db, savings.id, date, -15000, "Stream", food.id, stream);
    }
    const proposal = recurringSignals(sample.db, asOf).proposals[0];
    expect(proposal).toBeDefined();
    if (proposal) {
      createSchedule(sample.db, {
        name: "Stream",
        kind: "commitment",
        accountId: proposal.accountId,
        expectedAmount: proposal.expectedAmount,
        tolerance: proposal.tolerance,
        amountMode: proposal.amountMode,
        categoryId: null,
        transferAccountId: null,
        merchantId: proposal.merchantId,
        startDate: proposal.startDate,
        freq: proposal.freq,
        interval: proposal.interval,
        monthDay: proposal.monthDay,
        businessDayShift: "none",
        endDate: null,
        ...saved,
      });
    }
    expect(recurringSignals(sample.db, asOf).proposals).toEqual([]);

    const older = pay(sample.db, cash.id, "2026-01-09", -5000, "Match one", food.id);
    pay(sample.db, cash.id, "2026-01-11", -5000, "Match two", food.id);
    const imported = importStatement(sample.db, {
      asOf: "2026-10-07",
      source: "import",
      at,
      accountId: cash.id,
      filename: "review.csv",
      bytes: new TextEncoder().encode("date,description,amount\n01/10/2026,MATCH ROW,-5.00\n"),
      columnMap: map,
    });
    expect(imported.kind).toBe("batch");
    const reviewId = imported.kind === "batch" ? reviewRowIds(sample.db, imported.id)[0] : undefined;
    expect(reviewId).toBeDefined();
    if (imported.kind === "batch" && reviewId) {
      const beforeMatch = openCount(sample.db);
      resolveImportReview(sample.db, reviewId, { decision: "match", transactionId: older.id }, saved);
      const matched = sample.db.select().from(importRows).where(eq(importRows.id, reviewId)).get();
      expect(matched?.outcome).toBe("matched");
      expect(matched?.transactionId).toBe(older.id);
      expect(openCount(sample.db)).toBe(beforeMatch);
    }
    if (imported.kind === "batch") {
      expect(reviewRowIds(sample.db, imported.id)).toEqual([]);
    }

    pay(sample.db, cash.id, "2026-02-09", -7000, "Create one", food.id);
    pay(sample.db, cash.id, "2026-02-11", -7000, "Create two", food.id);
    const createBatch = importStatement(sample.db, {
      asOf: "2026-10-07",
      source: "import",
      at,
      accountId: cash.id,
      filename: "create.csv",
      bytes: new TextEncoder().encode("date,description,amount\n02/10/2026,CREATE ROW,-7.00\n"),
      columnMap: map,
    });
    const createdId = createBatch.kind === "batch" ? reviewRowIds(sample.db, createBatch.id)[0] : undefined;
    expect(createdId).toBeDefined();
    if (createBatch.kind === "batch" && createdId) {
      const beforeCreate = openCount(sample.db);
      resolveImportReview(sample.db, createdId, { decision: "create" }, saved);
      const created = sample.db.select().from(importRows).where(eq(importRows.id, createdId)).get();
      expect(created?.outcome).toBe("created");
      expect(created?.transactionId).toBeTruthy();
      expect(openCount(sample.db)).toBe(beforeCreate + 1);
    }
    if (createBatch.kind === "batch") {
      expect(reviewRowIds(sample.db, createBatch.id)).toEqual([]);
    }

    importStatement(sample.db, {
      asOf: "2026-10-07",
      source: "import",
      at,
      accountId: cash.id,
      filename: "bad.csv",
      bytes: new TextEncoder().encode("date,description,amount\n03/01/2026,GOOD ROW,-1.00\nxx/yy/2026,BAD ROW,1.00\n"),
      columnMap: map,
    });
    const unreadable = openUnreadableKeys(sample.db)[0];
    expect(unreadable).toBeDefined();
    if (unreadable) {
      decideInboxItem(sample.db, asOf, unreadable, "not_a_transaction", saved);
      expect(openUnreadableKeys(sample.db)).not.toContain(unreadable);
    }
  } finally {
    sample.close();
  }
});

test("auto-link runs for the imported account inside the import transaction", () => {
  const sample = book();
  try {
    const cash = account(sample.db, "Cash");
    const other = account(sample.db, "Other");
    const home = createSchedule(sample.db, { ...planFields(cash.id, null, -12500, "2026-02-15"), name: "Hydro", ...saved });
    const away = createSchedule(sample.db, { ...planFields(other.id, null, -8000, "2026-02-15"), name: "Other bill", ...saved });
    pay(sample.db, other.id, "2026-02-15", -8000, "Other bill", null);
    importStatement(sample.db, {
      source: "import",
      at,
      asOf: "2026-02-16",
      accountId: cash.id,
      filename: "hydro.csv",
      bytes: new TextEncoder().encode("date,description,amount\n02/15/2026,HYDRO,-12.50\n"),
      columnMap: map,
    });
    const links = sample.db.select().from(occurrenceLinks).all();
    expect(links.filter((link) => link.bucketId === home.id && link.transactionId)).toHaveLength(1);
    expect(links.filter((link) => link.bucketId === away.id)).toHaveLength(0);
    expect(sample.db.select().from(auditLog).where(eq(auditLog.entity, "occurrence_links")).all().some((row) => row.action === "link")).toBe(true);
  } finally {
    sample.close();
  }
});

test("undo of an import removes occurrence links for the removed transactions", () => {
  const sample = book();
  try {
    const cash = account(sample.db, "Cash");
    const plan = createSchedule(sample.db, { ...planFields(cash.id, null, -12500, "2026-02-15"), name: "Hydro", ...saved });
    const imported = importStatement(sample.db, {
      source: "import",
      at,
      asOf: "2026-02-16",
      accountId: cash.id,
      filename: "hydro.csv",
      bytes: new TextEncoder().encode("date,description,amount\n02/15/2026,HYDRO,-12.50\n"),
      columnMap: map,
    });
    expect(imported.kind).toBe("batch");
    expect(sample.db.select().from(occurrenceLinks).where(eq(occurrenceLinks.bucketId, plan.id)).all()).toHaveLength(1);
    if (imported.kind === "batch") {
      undoImportBatch(sample.db, imported.id, saved);
    }
    expect(sample.db.select().from(occurrenceLinks).where(eq(occurrenceLinks.bucketId, plan.id)).all()).toHaveLength(0);
    expect(
      sample.db.select().from(auditLog).where(eq(auditLog.entity, "occurrence_links")).all().some((row) => row.action === "delete"),
    ).toBe(true);
  } finally {
    sample.close();
  }
});
