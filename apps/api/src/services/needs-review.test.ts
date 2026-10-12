import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog, migrateDatabase, openDatabase, transactions } from "@num/db";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db";
import { ServiceError } from "../service-error";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { createCheckpoint } from "./checkpoints";
import { decideInboxItem } from "./inbox-decisions";
import { closeMonth, listMonths } from "./months";
import { listNeedsReview } from "./needs-review";
import { approveFiltered } from "./review-approve";
import { linkOccurrence, skipOccurrence } from "./recurring-links";
import { filteredReviewHits } from "./transaction-list";
import { createPlan } from "./recurring-plans";
import { createTransaction, getTransaction, updateTransaction } from "./transactions";

const saved = { source: "ui" as const, at: "2026-04-02T16:00:00Z" };
const asOf = "2026-04-02";

function withBook(run: (db: Db) => void) {
  const dir = mkdtempSync(join(tmpdir(), "num-needs-review-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  try {
    run(db);
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function account(db: Db, name: string) {
  return createAccount(db, { name, kind: "chequing", openingDate: "2026-01-01", openingBalance: 50_000, ...saved });
}

function pay(db: Db, accountId: string, date: string, amount: number, payee: string, categoryId?: string) {
  return createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw: payee,
    status: "cleared",
    lines: [{ amount, categoryId }],
    ...saved,
  });
}

function approve(db: Db, level: "sure" | "likely", count: number, filter: Parameters<typeof filteredReviewHits>[1], at: string) {
  return approveFiltered(db, asOf, filter, level, count, { source: "ui", at });
}

const noFilter = { uncategorized: false, automatic: false };

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
    const confirmed = pay(db, cash.id, "2026-03-01", -1_000, "Market", food.id);
    const likely = pay(db, cash.id, "2026-03-02", -1_000, "Market");
    const none = pay(db, cash.id, "2026-03-03", -400, "Odd shop");
    const sure = pay(db, cash.id, "2026-03-04", -800, "Cafe", food.id);
    stampAuto(db, sure.id, confirmed.id);
    const quiet = pay(db, cash.id, "2026-03-05", -200, "Rent", food.id);
    const left = pay(db, cash.id, "2026-03-06", -5_000, "Move", food.id);
    db.update(transactions).set({ source: "import" }).where(eq(transactions.id, left.id)).run();
    const right = pay(db, savings.id, "2026-03-06", 5_000, "Savings deposit", food.id);
    const pairKey = left.id < right.id ? `transfer_pair:${left.id}:${right.id}` : `transfer_pair:${right.id}:${left.id}`;
    const changedPlan = createPlan(db, {
      name: "Stream",
      kind: "bill",
      accountId: cash.id,
      expectedAmount: -1_000,
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
      active: true,
      fundsBuckets: false,
      ...saved,
    });
    const changedPay = pay(db, cash.id, "2026-03-15", -1_999, "Stream", food.id);
    linkOccurrence(db, changedPlan.id, "2026-03-15", changedPay.id, saved);
    createPlan(db, {
      name: "Phone",
      kind: "bill",
      accountId: savings.id,
      expectedAmount: -1_000,
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
      active: true,
      fundsBuckets: false,
      ...saved,
    });
    const phoneA = pay(db, savings.id, "2026-03-20", -1_000, "Phone a", food.id);
    const phoneB = pay(db, savings.id, "2026-03-21", -1_000, "Phone b", food.id);

    const questions = new Map(listNeedsReview(db, asOf).map((hit) => [hit.id, hit.review.question]));
    expect(questions.get(sure.id)).toBe("categorize");
    expect(listNeedsReview(db, asOf).find((hit) => hit.id === sure.id)?.review.level).toBe("sure");
    expect(questions.get(likely.id)).toBe("categorize");
    expect(listNeedsReview(db, asOf).find((hit) => hit.id === likely.id)?.review.level).toBe("likely");
    expect(questions.get(none.id)).toBe("categorize");
    expect(listNeedsReview(db, asOf).find((hit) => hit.id === none.id)?.review.level).toBe("none");
    expect(questions.get(left.id)).toBe("transfer_pair");
    expect(questions.get(right.id)).toBe("transfer_pair");
    expect(questions.get(changedPay.id)).toBe("recurring_changed");
    expect(questions.get(phoneA.id)).toBe("recurring_ambiguous");
    expect(questions.get(phoneB.id)).toBe("recurring_ambiguous");
    expect(questions.has(quiet.id)).toBe(false);
    expect(questions.has(confirmed.id)).toBe(false);

    decideInboxItem(db, asOf, pairKey, "not_transfer", saved);
    decideInboxItem(db, asOf, `recurring_changed:${changedPlan.id}:2026-03-15`, "keep_plan_amount", saved);
    const after = new Map(listNeedsReview(db, asOf).map((hit) => [hit.id, hit.review.question]));
    expect(after.has(left.id)).toBe(false);
    expect(after.has(right.id)).toBe(false);
    expect(after.get(changedPay.id)).not.toBe("recurring_changed");
    expect(after.get(phoneA.id)).toBe("recurring_ambiguous");
  });
});

test("approve all Sure confirms only the Sure rows in one write and counts as confirmations", () => {
  withBook((db) => {
    const cash = account(db, "Cash");
    const food = createCategory(db, { name: "Food", kind: "expense", ...saved });
    const known = pay(db, cash.id, "2026-03-01", -1_000, "Cafe", food.id);
    const sureA = pay(db, cash.id, "2026-03-02", -1_000, "Cafe", food.id);
    const sureB = pay(db, cash.id, "2026-03-03", -1_000, "Cafe", food.id);
    stampAuto(db, sureA.id, known.id);
    stampAuto(db, sureB.id, known.id);
    const openCafe = pay(db, cash.id, "2026-03-04", -1_000, "Cafe");
    const marketKnown = pay(db, cash.id, "2026-03-05", -2_000, "Market", food.id);
    const likely = pay(db, cash.id, "2026-03-06", -2_000, "Market");
    const at = "2026-04-02T18:00:00Z";
    const result = approve(db, "sure", 2, noFilter, at);
    expect(result.ids.sort()).toEqual([sureA.id, sureB.id].sort());
    expect(result.count).toBe(2);
    expect(getTransaction(db, sureA.id)?.autoReason).toBeNull();
    expect(getTransaction(db, sureB.id)?.autoReason).toBeNull();
    expect(getTransaction(db, likely.id)?.lines[0]?.categoryId).toBeNull();
    expect(getTransaction(db, openCafe.id)?.lines[0]?.categoryId).toBe(food.id);
    const audits = db.select().from(auditLog).where(eq(auditLog.at, at)).all();
    expect(audits.length).toBeGreaterThan(0);
    expect(new Set(audits.map((row) => row.at)).size).toBe(1);
    expect(getTransaction(db, marketKnown.id)?.autoReason).toBeNull();
  });
});

test("approve all Likely applies the suggestion", () => {
  withBook((db) => {
    const cash = account(db, "Cash");
    const food = createCategory(db, { name: "Food", kind: "expense", ...saved });
    pay(db, cash.id, "2026-03-01", -2_000, "Market", food.id);
    const likely = pay(db, cash.id, "2026-03-02", -2_000, "Market");
    const sure = pay(db, cash.id, "2026-03-03", -900, "Cafe", food.id);
    stampAuto(db, sure.id, sure.id);
    const result = approve(db, "likely", 1, noFilter, "2026-04-02T18:05:00Z");
    expect(result.ids).toEqual([likely.id]);
    expect(getTransaction(db, likely.id)?.lines[0]?.categoryId).toBe(food.id);
    expect(getTransaction(db, likely.id)?.autoReason).toBeNull();
    expect(getTransaction(db, sure.id)?.autoReason).toBe("learned_amount");
  });
});

test("approval uses the active filters and stops when the count changed", () => {
  withBook((db) => {
    const cash = account(db, "Cash");
    const other = account(db, "Other");
    const food = createCategory(db, { name: "Food", kind: "expense", ...saved });
    const known = pay(db, cash.id, "2026-03-01", -1_000, "Cafe", food.id);
    const here = pay(db, cash.id, "2026-03-02", -1_000, "Cafe", food.id);
    const there = pay(db, other.id, "2026-03-03", -1_000, "Cafe", food.id);
    stampAuto(db, here.id, known.id);
    stampAuto(db, there.id, known.id);
    expect(filteredReviewHits(db, { ...noFilter, accountId: cash.id }, asOf).map((hit) => hit.id)).toEqual([here.id]);
    expect(() => approve(db, "sure", 2, { ...noFilter, accountId: cash.id }, "2026-04-02T18:10:00Z")).toThrow(ServiceError);
    expect(getTransaction(db, here.id)?.autoReason).not.toBeNull();
    const result = approve(db, "sure", 1, { ...noFilter, accountId: cash.id }, "2026-04-02T18:11:00Z");
    expect(result.ids).toEqual([here.id]);
    expect(getTransaction(db, there.id)?.autoReason).not.toBeNull();
  });
});

test("a row has a bulk level only when the bulk action can apply it", () => {
  withBook((db) => {
    const cash = account(db, "Cash");
    const savings = account(db, "Savings");
    const food = createCategory(db, { name: "Food", kind: "expense", ...saved });
    const other = createCategory(db, { name: "Other", kind: "expense", ...saved });
    pay(db, cash.id, "2026-03-01", -2_000, "Market", food.id);
    const likely = pay(db, cash.id, "2026-03-02", -2_000, "Market");
    const split = createTransaction(db, {
      accountId: cash.id,
      date: "2026-03-03",
      amount: -2_000,
      payeeRaw: "Market",
      status: "cleared",
      lines: [
        { amount: -1_000, categoryId: other.id },
        { amount: -1_000 },
      ],
      ...saved,
    });
    const out = pay(db, cash.id, "2026-03-05", -50_000, "Move");
    pay(db, savings.id, "2026-03-06", 50_000, "Move");
    db.update(transactions).set({ source: "import" }).where(eq(transactions.id, out.id)).run();
    const hits = new Map(listNeedsReview(db, asOf).map((hit) => [hit.id, hit]));
    expect(hits.get(likely.id)?.review.level).toBe("likely");
    expect(hits.get(split.id)?.review.level).toBe("maybe");
    expect(hits.get(out.id)?.review.question).toBe("transfer_pair");
    expect(hits.get(out.id)?.review.level).toBe("none");
    const result = approve(db, "likely", 1, noFilter, "2026-04-02T18:20:00Z");
    expect(result.ids).toEqual([likely.id]);
    expect(approve(db, "likely", 0, noFilter, "2026-04-02T18:21:00Z")).toEqual({ level: "likely", count: 0, ids: [] });
  });
});

test("month close uses needs review and an open Home item for that month", () => {
  withBook((db) => {
    const cash = account(db, "Cash");
    const food = createCategory(db, { name: "Food", kind: "expense", ...saved });
    const posted = pay(db, cash.id, "2026-03-10", -40, "Shop");
    createCheckpoint(db, cash.id, { date: "2026-03-31", statementBalance: 49_960, ...saved });
    expect(listMonths(db, asOf).items.find((item) => item.month === "2026-03")?.blockers.map((item) => item.code)).toEqual([
      "needs_review",
    ]);
    updateTransaction(db, posted.id, {
      accountId: posted.accountId,
      date: posted.date,
      amount: posted.amount,
      payeeRaw: posted.payeeRaw,
      status: "cleared",
      lines: [{ amount: posted.amount, categoryId: food.id }],
      ...saved,
    });
    expect(listMonths(db, asOf).items.find((item) => item.month === "2026-03")?.blockers).toEqual([]);
    const gym = createPlan(db, {
      name: "Gym",
      kind: "bill",
      accountId: cash.id,
      expectedAmount: -1_000,
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
      active: true,
      fundsBuckets: false,
      ...saved,
    });
    expect(listMonths(db, asOf).items.find((item) => item.month === "2026-03")?.blockers.map((item) => item.code)).toEqual([
      "home_open",
    ]);
    skipOccurrence(db, gym.id, "2026-03-15", "Away", saved);
    expect(closeMonth(db, "2026-03", asOf, saved).status).toBe("closed");
  });
});
