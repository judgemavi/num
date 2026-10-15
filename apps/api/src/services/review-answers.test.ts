import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, occurrenceLinks, openDatabase, settings, transactions } from "@num/db";
import type { TransactionListQuery } from "@num/shared";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { decisionRows } from "./inbox-decisions";
import { listNeedsReview } from "./needs-review";
import { linkOccurrence } from "./recurring-links";
import { createSchedule } from "./schedule-test-book";
import { listReviewTransactions } from "./transaction-list";
import { acceptLooksRight, createTransaction, getTransaction, updateTransaction } from "./transactions";

const saved = { source: "ui" as const, at: "2026-04-02T16:00:00Z" };
const asOf = "2026-04-02";
const firstPage: TransactionListQuery = { page: 1, pageSize: 50, uncategorized: false, automatic: false };

function withBook(run: (db: Db, ids: { cash: string; savings: string; food: string }) => void) {
  const dir = mkdtempSync(join(tmpdir(), "num-review-answers-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "CAD" }).run();
  try {
    const opening = { kind: "chequing" as const, openingDate: "2026-01-01", openingBalance: 500_000, ...saved };
    const cash = createAccount(db, { name: "Cash", ...opening });
    const savings = createAccount(db, { name: "Savings", ...opening });
    const food = createCategory(db, { name: "Food", kind: "expense", ...saved });
    run(db, { cash: cash.id, savings: savings.id, food: food.id });
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function pay(db: Db, accountId: string, date: string, amount: number, payee: string, categoryId?: string) {
  return createTransaction(db, { accountId, date, amount, payeeRaw: payee, lines: [{ amount, categoryId }], ...saved });
}

function questionOf(db: Db, id: string) {
  return listNeedsReview(db, asOf).find((hit) => hit.id === id)?.review.question;
}

/** An imported row in Cash and a row with the opposite amount in Savings: a proposed transfer pair. */
function pair(db: Db, ids: { cash: string; savings: string; food: string }) {
  const left = pay(db, ids.cash, "2026-03-06", -50_000, "Move", ids.food);
  db.update(transactions).set({ source: "import" }).where(eq(transactions.id, left.id)).run();
  const right = pay(db, ids.savings, "2026-03-06", 50_000, "Savings deposit", ids.food);
  expect(questionOf(db, left.id)).toBe("transfer_pair");
  return { left, right };
}

test("Save as a transfer to the other account accepts the pair", () => {
  withBook((db, ids) => {
    const { left, right } = pair(db, ids);
    updateTransaction(db, left.id, {
      lines: [{ amount: -50_000, transferAccountId: ids.savings }],
      answer: { question: "transfer_pair", otherId: right.id, asOf },
      ...saved,
    });
    expect(getTransaction(db, left.id)?.transferPeerId).toBe(right.id);
    expect(getTransaction(db, right.id)?.transferPeerId).toBe(left.id);
    expect(getTransaction(db, right.id)?.lines[0]?.transferAccountId).toBe(ids.cash);
    // The pair is linked: the save made no mirror.
    expect(db.select().from(transactions).all()).toHaveLength(2);
    expect(questionOf(db, left.id)).toBeUndefined();
    expect(questionOf(db, right.id)).toBeUndefined();
  });
});

test("Save as another choice records not_transfer and the question does not come back", () => {
  withBook((db, ids) => {
    const { left, right } = pair(db, ids);
    updateTransaction(db, left.id, { answer: { question: "transfer_pair", otherId: right.id, asOf }, ...saved });
    const key = left.id < right.id ? `transfer_pair:${left.id}:${right.id}` : `transfer_pair:${right.id}:${left.id}`;
    expect(decisionRows(db).find((row) => row.itemKey === key)?.decision).toBe("not_transfer");
    expect(getTransaction(db, left.id)?.transferPeerId).toBeNull();
    expect(questionOf(db, left.id)).toBeUndefined();
    expect(questionOf(db, right.id)).toBeUndefined();
  });
});

test("Save with No purchase records not_linked and the refund question does not come back", () => {
  withBook((db, ids) => {
    const first = pay(db, ids.cash, "2026-03-01", -20_000, "Corner Shop", ids.food);
    pay(db, ids.cash, "2026-03-05", -20_000, "Corner Shop", ids.food);
    const refund = pay(db, ids.cash, "2026-03-10", 20_000, "Corner Shop", ids.food);
    expect(questionOf(db, refund.id)).toBe("refund_purchase");
    updateTransaction(db, refund.id, { refundOfId: null, answer: { question: "refund_purchase" }, ...saved });
    expect(decisionRows(db).find((row) => row.itemKey === `refund_link:${refund.id}`)?.decision).toBe("not_linked");
    expect(questionOf(db, refund.id)).not.toBe("refund_purchase");
    // Save with a purchase links it, and records no "no".
    const other = pay(db, ids.cash, "2026-03-11", 20_000, "Corner Shop", ids.food);
    updateTransaction(db, other.id, { refundOfId: first.id, answer: { question: "refund_purchase" }, ...saved });
    expect(getTransaction(db, other.id)?.refundOfId).toBe(first.id);
    expect(decisionRows(db).some((row) => row.itemKey === `refund_link:${other.id}`)).toBe(false);
  });
});

function bill(db: Db, accountId: string, name: string, day: number, categoryId: string | null) {
  return createSchedule(db, {
    name,
    kind: "commitment",
    accountId,
    expectedAmount: -10_000,
    tolerance: 0,
    amountMode: "fixed",
    categoryId,
    transferAccountId: null,
    merchantId: null,
    startDate: `2026-03-${day}`,
    freq: "monthly",
    interval: 1,
    monthDay: day,
    businessDayShift: "none",
    endDate: `2026-03-${day}`,
    ...saved,
  });
}

test("Save with Payment for links the transaction to the occurrence", () => {
  withBook((db, ids) => {
    const plan = bill(db, ids.cash, "Phone", 20, null);
    // One day before and one day after the due date: the same distance.
    const first = pay(db, ids.cash, "2026-03-19", -10_000, "Phone a", ids.food);
    const second = pay(db, ids.cash, "2026-03-21", -10_000, "Phone b", ids.food);
    expect(questionOf(db, first.id)).toBe("recurring_ambiguous");
    updateTransaction(db, first.id, { answer: { question: "recurring_ambiguous", bucketId: plan.id, dueDate: "2026-03-20" }, ...saved });
    const link = db.select().from(occurrenceLinks).where(eq(occurrenceLinks.bucketId, plan.id)).get();
    expect(link?.transactionId).toBe(first.id);
    expect(link?.dueDate).toBe("2026-03-20");
    expect(questionOf(db, first.id)).toBeUndefined();
    expect(questionOf(db, second.id)).toBeUndefined();
  });
});

test("the review read gives the rows in the requested sort order and pages", () => {
  withBook((db, ids) => {
    const small = pay(db, ids.cash, "2026-03-03", -3000, "Shop c");
    const large = pay(db, ids.cash, "2026-03-01", -9000, "Shop a");
    const middle = pay(db, ids.cash, "2026-03-02", -5000, "Shop b");
    pay(db, ids.cash, "2026-03-04", -7000, "Shop d", ids.food);
    const read = (query: Partial<TransactionListQuery>) =>
      listReviewTransactions(db, { ...firstPage, ...query, asOf }).items.map((row) => row.id);
    expect(read({})).toEqual([small.id, middle.id, large.id]);
    expect(read({ sort: "amount", dir: "asc" })).toEqual([large.id, middle.id, small.id]);
    expect(read({ sort: "payeeRaw", dir: "desc" })).toEqual([small.id, middle.id, large.id]);
    expect(read({ sort: "date", dir: "asc", page: 2, pageSize: 2 })).toEqual([small.id]);
    const page = listReviewTransactions(db, { ...firstPage, accountId: ids.cash, asOf });
    expect(page.total).toBe(3);
    expect(page.reviewCounts.none).toBe(3);
    // One account: each row has the balance of the account after it, as in the transaction list.
    expect(page.items.map((row) => row.runningBalance)).toEqual([500_000 - 17_000, 500_000 - 14_000, 500_000 - 9000]);
  });
});

test("a changed recurring amount is not in the review read", () => {
  withBook((db, ids) => {
    const plan = bill(db, ids.cash, "Stream", 15, ids.food);
    const paid = pay(db, ids.cash, "2026-03-15", -19_990, "Stream", ids.food);
    linkOccurrence(db, plan.id, "2026-03-15", paid.id, saved);
    acceptLooksRight(db, paid.id, saved);
    expect(listReviewTransactions(db, { ...firstPage, asOf }).items.map((row) => row.id)).not.toContain(paid.id);
  });
});
