import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog, importRows, merchants, migrateDatabase, occurrenceLinks, openDatabase, settings, transactions } from "@num/db";
import { columnMapSchema, type ColumnMap, type InboxKind } from "@num/shared";
import { expect, test } from "bun:test";
import { eq, isNull } from "drizzle-orm";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { coverBucket, createBucketEvent } from "./bucket-events";
import { createBucket } from "./buckets";
import { createCategory } from "./categories";
import { undoImportBatch } from "./import-undo";
import { importStatement } from "./imports";
import { resolveImportReview } from "./import-review";
import { dismissInboxItem, listInbox, restoreInboxItem } from "./inbox";
import { createPlan, updatePlan } from "./recurring-plans";
import { linkOccurrence, skipOccurrence } from "./recurring-links";
import { acceptTransferPair, promotePayee } from "./suggestions";
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
    name,
    institution: null,
    kind: "chequing",
    openingDate: "2026-01-01",
    openingBalance: 0,
    ...saved,
  });
}

function category(db: Db, name: string) {
  return createCategory(db, { name, kind: "expense", essential: false, ...saved });
}

function merchant(db: Db, name: string) {
  const id = crypto.randomUUID();
  db.insert(merchants).values({ id, name, defaultCategoryId: null, archivedAt: null }).run();
  return id;
}

function pay(db: Db, accountId: string, date: string, amount: number, payee: string, categoryId: string | null, merchantId: string | null = null) {
  return createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw: payee,
    merchantId,
    status: "open",
    lines: [{ amount, categoryId, memo: null, transferAccountId: null, tagIds: [] }],
    ...saved,
  });
}

function openCount(db: Db): number {
  return db.select({ id: transactions.id }).from(transactions).where(isNull(transactions.deletedAt)).all().length;
}

function keys(db: Db, kind: InboxKind) {
  return listInbox(db, asOf).items.filter((item) => item.kind === kind).map((item) => item.itemKey);
}

function planFields(accountId: string, merchantId: string | null, expectedAmount: number, startDate: string) {
  return {
    name: "Stream",
    kind: "bill" as const,
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
    active: true,
    fundsBuckets: false,
  };
}

test("each inbox kind appears and leaves after its action", () => {
  const sample = book();
  try {
    const cash = account(sample.db, "Cash");
    const savings = account(sample.db, "Savings");
    const food = category(sample.db, "Food");
    const dining = category(sample.db, "Dining");
    const shop = merchant(sample.db, "North Market");
    const stream = merchant(sample.db, "Stream Co");

    const open = pay(sample.db, cash.id, "2026-03-02", -6400, "Corner market", null);
    expect(keys(sample.db, "uncategorized")).toEqual([`uncategorized:${open.lines[0]?.id}`]);
    updateTransaction(sample.db, open.id, {
      accountId: open.accountId,
      date: open.date,
      amount: open.amount,
      payeeRaw: open.payeeRaw,
      merchantId: open.merchantId,
      notes: open.notes,
      status: "open",
      lines: [{ amount: open.amount, categoryId: food.id, memo: null, transferAccountId: null, tagIds: [] }],
      ...saved,
    });
    expect(keys(sample.db, "uncategorized")).toEqual([]);

    const left = pay(sample.db, cash.id, "2026-03-05", -50000, "Move", food.id);
    const right = pay(sample.db, savings.id, "2026-03-06", 50000, "Move", food.id);
    const pairKey = left.id < right.id ? `transfer_pair:${left.id}:${right.id}` : `transfer_pair:${right.id}:${left.id}`;
    expect(keys(sample.db, "transfer_pair")).toEqual([pairKey]);
    const beforePair = openCount(sample.db);
    acceptTransferPair(sample.db, asOf, left.id, right.id, saved);
    expect(openCount(sample.db)).toBe(beforePair);
    expect(getTransaction(sample.db, left.id)?.lines).toEqual([
      expect.objectContaining({ transferAccountId: right.accountId }),
    ]);
    expect(getTransaction(sample.db, right.id)?.lines).toEqual([
      expect.objectContaining({ transferAccountId: left.accountId }),
    ]);
    expect(keys(sample.db, "transfer_pair")).toEqual([]);

    for (const date of ["2026-03-01", "2026-03-02", "2026-03-03"]) {
      pay(sample.db, cash.id, date, -900, "North market", food.id, shop);
    }
    const promote = listInbox(sample.db, asOf).items.find((item) => item.kind === "promote_rule");
    expect(promote?.kind).toBe("promote_rule");
    if (promote?.kind === "promote_rule") {
      promotePayee(sample.db, { payee: promote.payee, merchantId: promote.merchantId, categoryId: promote.categoryId, ...saved });
    }
    expect(keys(sample.db, "promote_rule")).toEqual([]);

    const meals = createBucket(sample.db, {
      name: "Meals",
      kind: "spending",
      priority: 1,
      essential: false,
      color: "pink",
      icon: "utensils",
      categoryIds: [dining.id],
      refillTo: 1000,
      amount: null,
      dueDate: null,
      repeat: null,
      target: null,
      targetDate: null,
      fixedAmount: null,
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
      refillTo: 1000,
      amount: null,
      dueDate: null,
      repeat: null,
      target: null,
      targetDate: null,
      fixedAmount: null,
      ...saved,
    });
    pay(sample.db, cash.id, "2026-03-08", -4200, "Dining out", dining.id);
    createBucketEvent(sample.db, spare.id, { kind: "fund", amount: 5000, date: "2026-03-01", ...saved });
    const marchKey = `bucket_overspent:${meals.id}:2026-03`;
    expect(keys(sample.db, "bucket_overspent")).toEqual([marchKey]);
    dismissInboxItem(sample.db, asOf, marchKey, "Later", saved);
    expect(listInbox(sample.db, "2026-04-20").items.some((item) => item.itemKey === `bucket_overspent:${meals.id}:2026-04`)).toBe(true);
    restoreInboxItem(sample.db, marchKey, saved);
    coverBucket(sample.db, meals.id, { fromBucketId: spare.id, date: asOf, ...saved });
    expect(keys(sample.db, "bucket_overspent")).toEqual([]);

    const changedPlan = createPlan(sample.db, { ...planFields(cash.id, null, -1000, "2026-03-15"), ...saved });
    const changedPay = pay(sample.db, cash.id, "2026-03-15", -1999, "Stream", food.id);
    linkOccurrence(sample.db, changedPlan.id, "2026-03-15", changedPay.id, saved);
    expect(keys(sample.db, "recurring_changed")).toEqual([`recurring_changed:${changedPlan.id}:2026-03-15`]);
    updatePlan(sample.db, changedPlan.id, { ...planFields(cash.id, null, -1999, "2026-03-15"), name: changedPlan.name, ...saved });
    expect(keys(sample.db, "recurring_changed")).toEqual([]);

    const missedPlan = createPlan(sample.db, { ...planFields(cash.id, null, -1000, "2026-01-15"), endDate: null, name: "Gym", ...saved });
    expect(keys(sample.db, "recurring_missed")).toContain(`recurring_missed:${missedPlan.id}:2026-02-15`);
    skipOccurrence(sample.db, missedPlan.id, "2026-02-15", "Closed", saved);
    expect(keys(sample.db, "recurring_missed")).not.toContain(`recurring_missed:${missedPlan.id}:2026-02-15`);

    const ambiguousPlan = createPlan(sample.db, { ...planFields(savings.id, null, -1000, "2026-03-15"), name: "Phone", ...saved });
    const first = pay(sample.db, savings.id, "2026-03-15", -1000, "Phone a", food.id);
    const second = pay(sample.db, savings.id, "2026-03-16", -1000, "Phone b", food.id);
    expect(keys(sample.db, "recurring_ambiguous")).toEqual([`recurring_ambiguous:${ambiguousPlan.id}:2026-03-15`]);
    linkOccurrence(sample.db, ambiguousPlan.id, "2026-03-15", first.id, saved);
    expect(keys(sample.db, "recurring_ambiguous")).toEqual([]);
    expect(second.id).not.toBe(first.id);

    for (const date of ["2026-01-15", "2026-02-15", "2026-03-15"]) {
      pay(sample.db, savings.id, date, -1500, "Stream", food.id, stream);
    }
    const proposal = listInbox(sample.db, asOf).items.find((item) => item.kind === "plan_proposal");
    expect(proposal?.kind).toBe("plan_proposal");
    if (proposal?.kind === "plan_proposal") {
      createPlan(sample.db, {
        name: "Stream",
        kind: "bill",
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
        active: true,
        fundsBuckets: false,
        ...saved,
      });
    }
    expect(keys(sample.db, "plan_proposal")).toEqual([]);

    const older = pay(sample.db, cash.id, "2026-01-09", -500, "Match one", food.id);
    pay(sample.db, cash.id, "2026-01-11", -500, "Match two", food.id);
    const imported = importStatement(sample.db, sample.dir, {
      source: "import",
      at,
      accountId: cash.id,
      filename: "review.csv",
      mimeType: "text/csv",
      bytes: new TextEncoder().encode("date,description,amount\n01/10/2026,MATCH ROW,-5.00\n"),
      columnMap: map,
    });
    expect(imported.kind).toBe("batch");
    const review = listInbox(sample.db, asOf).items.find((item) => item.kind === "import_review");
    expect(review?.kind).toBe("import_review");
    if (review?.kind === "import_review") {
      const beforeMatch = openCount(sample.db);
      resolveImportReview(sample.db, review.importRowId, { decision: "match", transactionId: older.id }, saved);
      const matched = sample.db.select().from(importRows).where(eq(importRows.id, review.importRowId)).get();
      expect(matched?.outcome).toBe("matched");
      expect(matched?.transactionId).toBe(older.id);
      expect(openCount(sample.db)).toBe(beforeMatch);
    }
    expect(keys(sample.db, "import_review")).toEqual([]);

    pay(sample.db, cash.id, "2026-02-09", -700, "Create one", food.id);
    pay(sample.db, cash.id, "2026-02-11", -700, "Create two", food.id);
    importStatement(sample.db, sample.dir, {
      source: "import",
      at,
      accountId: cash.id,
      filename: "create.csv",
      mimeType: "text/csv",
      bytes: new TextEncoder().encode("date,description,amount\n02/10/2026,CREATE ROW,-7.00\n"),
      columnMap: map,
    });
    const createdReview = listInbox(sample.db, asOf).items.find((item) => item.kind === "import_review");
    expect(createdReview?.kind).toBe("import_review");
    if (createdReview?.kind === "import_review") {
      const beforeCreate = openCount(sample.db);
      resolveImportReview(sample.db, createdReview.importRowId, { decision: "create" }, saved);
      const created = sample.db.select().from(importRows).where(eq(importRows.id, createdReview.importRowId)).get();
      expect(created?.outcome).toBe("created");
      expect(created?.transactionId).toBeTruthy();
      expect(openCount(sample.db)).toBe(beforeCreate + 1);
    }
    expect(keys(sample.db, "import_review")).toEqual([]);

    importStatement(sample.db, sample.dir, {
      source: "import",
      at,
      accountId: cash.id,
      filename: "bad.csv",
      mimeType: "text/csv",
      bytes: new TextEncoder().encode("date,description,amount\n03/01/2026,GOOD ROW,-1.00\nxx/yy/2026,BAD ROW,1.00\n"),
      columnMap: map,
    });
    const unreadable = listInbox(sample.db, asOf).items.find((item) => item.kind === "import_unreadable");
    expect(unreadable?.kind).toBe("import_unreadable");
    if (unreadable) {
      dismissInboxItem(sample.db, asOf, unreadable.itemKey, "Cannot repair the row", saved);
    }
    expect(keys(sample.db, "import_unreadable")).toEqual([]);
  } finally {
    sample.close();
  }
});

test("dismiss hides an item and un-dismiss shows it", () => {
  const sample = book();
  try {
    const cash = account(sample.db, "Cash");
    const open = pay(sample.db, cash.id, "2026-03-04", -100, "Needs a category", null);
    const itemKey = `uncategorized:${open.lines[0]?.id}`;
    expect(keys(sample.db, "uncategorized")).toEqual([itemKey]);
    dismissInboxItem(sample.db, asOf, itemKey, "Later", saved);
    expect(keys(sample.db, "uncategorized")).toEqual([]);
    restoreInboxItem(sample.db, itemKey, saved);
    expect(keys(sample.db, "uncategorized")).toEqual([itemKey]);
  } finally {
    sample.close();
  }
});

test("auto-link runs for the imported account after the import commits", () => {
  const sample = book();
  try {
    const cash = account(sample.db, "Cash");
    const other = account(sample.db, "Other");
    const home = createPlan(sample.db, { ...planFields(cash.id, null, -1250, "2026-02-15"), name: "Hydro", ...saved });
    const away = createPlan(sample.db, { ...planFields(other.id, null, -800, "2026-02-15"), name: "Other bill", ...saved });
    pay(sample.db, other.id, "2026-02-15", -800, "Other bill", null);
    importStatement(sample.db, sample.dir, {
      source: "import",
      at,
      asOf: "2026-02-16",
      accountId: cash.id,
      filename: "hydro.csv",
      mimeType: "text/csv",
      bytes: new TextEncoder().encode("date,description,amount\n02/15/2026,HYDRO,-12.50\n"),
      columnMap: map,
    });
    const links = sample.db.select().from(occurrenceLinks).all();
    expect(links.filter((link) => link.planId === home.id && link.transactionId)).toHaveLength(1);
    expect(links.filter((link) => link.planId === away.id)).toHaveLength(0);
    expect(sample.db.select().from(auditLog).where(eq(auditLog.entity, "occurrence_links")).all().some((row) => row.action === "link")).toBe(true);
  } finally {
    sample.close();
  }
});

test("undo of an import removes occurrence links for the removed transactions", () => {
  const sample = book();
  try {
    const cash = account(sample.db, "Cash");
    const plan = createPlan(sample.db, { ...planFields(cash.id, null, -1250, "2026-02-15"), name: "Hydro", ...saved });
    const imported = importStatement(sample.db, sample.dir, {
      source: "import",
      at,
      asOf: "2026-02-16",
      accountId: cash.id,
      filename: "hydro.csv",
      mimeType: "text/csv",
      bytes: new TextEncoder().encode("date,description,amount\n02/15/2026,HYDRO,-12.50\n"),
      columnMap: map,
    });
    expect(imported.kind).toBe("batch");
    expect(sample.db.select().from(occurrenceLinks).where(eq(occurrenceLinks.planId, plan.id)).all()).toHaveLength(1);
    if (imported.kind === "batch") {
      undoImportBatch(sample.db, imported.id, saved);
    }
    expect(sample.db.select().from(occurrenceLinks).where(eq(occurrenceLinks.planId, plan.id)).all()).toHaveLength(0);
    expect(
      sample.db.select().from(auditLog).where(eq(auditLog.entity, "occurrence_links")).all().some((row) => row.action === "delete"),
    ).toBe(true);
  } finally {
    sample.close();
  }
});
