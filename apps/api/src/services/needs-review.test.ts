import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog, migrateDatabase, openDatabase, settings, transactions } from "@num/db";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { readHygiene } from "./hygiene";
import { decideInboxItem, decisionRows, undoInboxDecision } from "./inbox-decisions";
import { listNeedsReview } from "./needs-review";
import { approveSelected } from "./review-approve";
import { linkOccurrence } from "./recurring-links";
import { createSchedule } from "./schedule-test-book";
import { createTransaction, getTransaction, updateTransaction } from "./transactions";

const saved = { source: "ui" as const, at: "2026-04-02T16:00:00Z" };
const asOf = "2026-04-02";

function withBook(run: (db: Db) => void) {
  const dir = mkdtempSync(join(tmpdir(), "num-needs-review-"));
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

function account(db: Db, name: string) {
  return createAccount(db, { name, kind: "chequing", openingDate: "2026-01-01", openingBalance: 500_000, ...saved });
}

function pay(db: Db, accountId: string, date: string, amount: number, payee: string, categoryId?: string) {
  return createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw: payee,
    lines: [{ amount, categoryId }],
    ...saved,
  });
}

function approve(db: Db, ids: string[], at: string) {
  return approveSelected(db, asOf, ids, { source: "ui", at });
}

function stampAuto(db: Db, id: string, sourceId: string) {
  db.update(transactions)
    .set({ autoReason: "learned_amount", autoConfidence: 850, autoSourceId: sourceId })
    .where(eq(transactions.id, id))
    .run();
}

test("needs review returns each kind and leaves out confirmed rows and a recorded no", () => {
  withBook((db) => {
    const cash = account(db, "Cash");
    const savings = account(db, "Savings");
    const food = createCategory(db, { name: "Food", kind: "expense", ...saved });
    const confirmed = pay(db, cash.id, "2026-03-01", -10_000, "Market", food.id);
    const likely = pay(db, cash.id, "2026-03-02", -10_000, "Market");
    const none = pay(db, cash.id, "2026-03-03", -4000, "Odd shop");
    const sure = pay(db, cash.id, "2026-03-04", -8000, "Cafe", food.id);
    stampAuto(db, sure.id, confirmed.id);
    const quiet = pay(db, cash.id, "2026-03-05", -2000, "Rent", food.id);
    const left = pay(db, cash.id, "2026-03-06", -50_000, "Move", food.id);
    db.update(transactions).set({ source: "import" }).where(eq(transactions.id, left.id)).run();
    const right = pay(db, savings.id, "2026-03-06", 50_000, "Savings deposit", food.id);
    const pairKey = left.id < right.id ? `transfer_pair:${left.id}:${right.id}` : `transfer_pair:${right.id}:${left.id}`;
    const changedPlan = createSchedule(db, {
      name: "Stream",
      kind: "commitment",
      accountId: cash.id,
      expectedAmount: -10_000,
      tolerance: 0,
      amountMode: "fixed",
      categoryId: food.id,
      transferAccountId: null,
      merchantId: null,
      startDate: "2026-03-15",
      freq: "monthly",
      interval: 1,
      monthDay: 15,
      businessDayShift: "none",
      endDate: "2026-03-15",
      ...saved,
    });
    const changedPay = pay(db, cash.id, "2026-03-15", -19_990, "Stream", food.id);
    linkOccurrence(db, changedPlan.id, "2026-03-15", changedPay.id, saved);
    createSchedule(db, {
      name: "Phone",
      kind: "commitment",
      accountId: savings.id,
      expectedAmount: -10_000,
      tolerance: 0,
      amountMode: "fixed",
      categoryId: null,
      transferAccountId: null,
      merchantId: null,
      startDate: "2026-03-20",
      freq: "monthly",
      interval: 1,
      monthDay: 20,
      businessDayShift: "none",
      endDate: "2026-03-20",
      ...saved,
    });
    const phoneA = pay(db, savings.id, "2026-03-20", -10_000, "Phone a", food.id);
    const phoneB = pay(db, savings.id, "2026-03-21", -10_000, "Phone b", food.id);

    const questions = new Map(listNeedsReview(db, asOf).map((hit) => [hit.id, hit.review.question]));
    expect(questions.get(sure.id)).toBe("categorize");
    expect(listNeedsReview(db, asOf).find((hit) => hit.id === sure.id)?.review.level).toBe("sure");
    expect(questions.get(likely.id)).toBe("categorize");
    expect(listNeedsReview(db, asOf).find((hit) => hit.id === likely.id)?.review.level).toBe("likely");
    expect(questions.get(none.id)).toBe("categorize");
    expect(listNeedsReview(db, asOf).find((hit) => hit.id === none.id)?.review.level).toBe("none");
    expect(questions.get(left.id)).toBe("transfer_pair");
    expect(questions.get(right.id)).toBe("transfer_pair");
    // A changed amount is not a question in Needs review. The link gives the row the label of the plan.
    expect(questions.get(changedPay.id)).toBe("categorize");
    expect(questions.get(phoneA.id)).toBe("recurring_ambiguous");
    expect(questions.get(phoneB.id)).toBe("recurring_ambiguous");
    expect(questions.has(quiet.id)).toBe(false);
    expect(questions.has(confirmed.id)).toBe(false);

    decideInboxItem(db, asOf, pairKey, "not_transfer", saved);
    const after = new Map(listNeedsReview(db, asOf).map((hit) => [hit.id, hit.review.question]));
    expect(after.has(left.id)).toBe(false);
    expect(after.has(right.id)).toBe(false);
    expect(after.get(phoneA.id)).toBe("recurring_ambiguous");
  });
});

test("approve confirms the automatic label and applies the suggestion of the selected rows, and counts as confirmations", () => {
  withBook((db) => {
    const cash = account(db, "Cash");
    const food = createCategory(db, { name: "Food", kind: "expense", ...saved });
    const known = pay(db, cash.id, "2026-03-01", -10_000, "Cafe", food.id);
    const sureA = pay(db, cash.id, "2026-03-02", -10_000, "Cafe", food.id);
    const sureB = pay(db, cash.id, "2026-03-03", -10_000, "Cafe", food.id);
    stampAuto(db, sureA.id, known.id);
    stampAuto(db, sureB.id, known.id);
    const openCafe = pay(db, cash.id, "2026-03-04", -10_000, "Cafe");
    pay(db, cash.id, "2026-03-05", -20_000, "Market", food.id);
    const likely = pay(db, cash.id, "2026-03-06", -20_000, "Market");
    const notSelected = pay(db, cash.id, "2026-03-07", -20_000, "Market");
    const at = "2026-04-02T18:00:00Z";
    const result = approve(db, [sureA.id, sureB.id, likely.id], at);
    expect(result).toEqual({ approved: 3, skipped: [] });
    expect(getTransaction(db, sureA.id)?.autoReason).toBeNull();
    expect(getTransaction(db, sureB.id)?.autoReason).toBeNull();
    expect(getTransaction(db, likely.id)?.lines[0]?.categoryId).toBe(food.id);
    expect(getTransaction(db, likely.id)?.autoReason).toBeNull();
    // The confirmations teach: the open rows of the same payees get the label.
    expect(getTransaction(db, openCafe.id)?.lines[0]?.categoryId).toBe(food.id);
    expect(getTransaction(db, notSelected.id)?.autoReason).not.toBeNull();
    const audits = db.select().from(auditLog).where(eq(auditLog.at, at)).all();
    expect(new Set(audits.map((row) => row.at)).size).toBe(1);
  });
});

test("approve skips a row with a question, a row with no suggestion and a row that does not need review", () => {
  withBook((db) => {
    const cash = account(db, "Cash");
    const savings = account(db, "Savings");
    const food = createCategory(db, { name: "Food", kind: "expense", ...saved });
    const none = pay(db, cash.id, "2026-03-03", -4000, "Odd shop");
    const done = pay(db, cash.id, "2026-03-04", -4000, "Shop", food.id);
    const out = pay(db, cash.id, "2026-03-05", -500_000, "Move");
    pay(db, savings.id, "2026-03-05", 500_000, "Move");
    db.update(transactions).set({ source: "import" }).where(eq(transactions.id, out.id)).run();
    const at = "2026-04-02T18:10:00Z";
    expect(approve(db, [none.id, done.id, out.id], at)).toEqual({
      approved: 0,
      skipped: [
        { id: none.id, reason: "no_suggestion" },
        { id: done.id, reason: "no_suggestion" },
        { id: out.id, reason: "question" },
      ],
    });
    expect(db.select().from(auditLog).where(eq(auditLog.at, at)).all()).toHaveLength(0);
  });
});

test("keeping a row uncategorized removes it from Needs review and Hygiene until it gets a category or the user undoes it", () => {
  withBook((db) => {
    const bank = account(db, "Bank");
    const category = createCategory(db, { name: "Food", kind: "expense", groupId: null, ...saved });
    const row = pay(db, bank.id, "2026-01-05", -20_000, "KEEP ME");
    const body = {
      accountId: bank.id,
      date: "2026-01-05",
      amount: -20_000,
      payeeRaw: "KEEP ME",
      lines: [{ amount: -20_000 }],
      ...saved,
    };
    const oldCount = () => {
      const check = readHygiene(db, asOf).checks.find((item) => item.code === "review");
      return check && "oldCount" in check ? check.oldCount : -1;
    };
    const keyOf = `uncategorized:${row.id}`;
    expect(listNeedsReview(db, asOf).map((hit) => hit.id)).toEqual([row.id]);
    expect(oldCount()).toBe(1);

    updateTransaction(db, row.id, { ...body, keepUncategorized: true });
    expect(decisionRows(db).map((item) => item.itemKey)).toEqual([keyOf]);
    expect(listNeedsReview(db, asOf)).toEqual([]);
    expect(oldCount()).toBe(0);

    undoInboxDecision(db, keyOf, saved);
    expect(listNeedsReview(db, asOf).map((hit) => hit.id)).toEqual([row.id]);

    decideInboxItem(db, asOf, keyOf, "keep_uncategorized", saved);
    expect(listNeedsReview(db, asOf)).toEqual([]);
    expect(() => decideInboxItem(db, asOf, keyOf, "keep_uncategorized", saved)).toThrow();

    updateTransaction(db, row.id, { ...body, lines: [{ amount: -20_000, categoryId: category.id }] });
    expect(decisionRows(db)).toEqual([]);
    expect(() => decideInboxItem(db, asOf, keyOf, "keep_uncategorized", saved)).toThrow();
  });
});

test("saving an automatically labelled row with no category keeps it out of Needs review until it gets a category", () => {
  withBook((db) => {
    const bank = account(db, "Bank");
    const rental = createCategory(db, { name: "Rental Income", kind: "income", ...saved });
    const confirmed = pay(db, bank.id, "2026-01-01", 2_000_000, "E-TRANSFER", rental.id);
    const row = pay(db, bank.id, "2026-02-01", 40_000, "E-TRANSFER", rental.id);
    stampAuto(db, row.id, confirmed.id);
    expect(listNeedsReview(db, asOf).map((hit) => hit.id)).toEqual([row.id]);

    updateTransaction(db, row.id, { lines: [{ amount: 40_000 }], keepUncategorized: true, ...saved });
    expect(getTransaction(db, row.id)?.autoReason).toBe(null);
    expect(decisionRows(db).map((item) => item.itemKey)).toEqual([`uncategorized:${row.id}`]);
    expect(listNeedsReview(db, asOf)).toEqual([]);
    expect(approve(db, [row.id], "2026-04-02T18:00:00Z")).toEqual({ approved: 0, skipped: [{ id: row.id, reason: "no_suggestion" }] });
    expect(getTransaction(db, row.id)?.lines[0]?.categoryId).toBe(null);

    updateTransaction(db, row.id, { lines: [{ amount: 40_000, categoryId: rental.id }], ...saved });
    expect(decisionRows(db)).toEqual([]);
  });
});
