import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inboxDecisions, migrateDatabase, openDatabase, transactions } from "@num/db";
import { eq } from "drizzle-orm";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { decideInboxItem } from "./inbox-decisions";
import { applyInboxGroup } from "./inbox-group";
import { createMerchant } from "./merchants";
import { listNeedsReview } from "./needs-review";
import { acceptLooksRight, createTransaction, deleteTransaction, getTransaction, updateTransaction } from "./transactions";

const saved = { source: "ui" as const, at: "2026-04-02T16:00:00Z" };
const asOf = "2026-04-02";

function withBook(run: (db: Db, ids: { account: string; food: string; shop: string }) => void) {
  const dir = mkdtempSync(join(tmpdir(), "num-refund-auto-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  try {
    const account = createAccount(db, { name: "Cash", kind: "chequing", openingDate: "2026-01-01", openingBalance: 0, ...saved });
    const food = createCategory(db, { name: "Food", kind: "expense", ...saved });
    const shop = createMerchant(db, { name: "Corner Shop", ...saved });
    run(db, { account: account.id, food: food.id, shop: shop.id });
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function money(db: Db, accountId: string, date: string, amount: number, categoryId?: string, merchantId?: string) {
  return createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw: "Corner Shop",
    status: "cleared",
    merchantId,
    lines: [{ amount, categoryId }],
    ...saved,
  });
}

/** The person says Yes to a category for an uncategorized refund. This is an approval, so it can link. */
function approved(db: Db, ids: { account: string; food: string }, date: string, amount: number) {
  const refund = money(db, ids.account, date, amount);
  applyInboxGroup(db, {
    accountId: ids.account,
    transactionIds: [refund.id],
    excludedIds: [],
    categoryId: ids.food,
    transferAccountId: null,
    merchantId: null,
    ...saved,
  });
  return refund;
}

function questionOf(db: Db, id: string) {
  return listNeedsReview(db, asOf).find((hit) => hit.id === id)?.review;
}

test("one purchase with the same amount links the refund and makes it Sure", () => {
  withBook((db, ids) => {
    const purchase = money(db, ids.account, "2026-03-01", -2_000, ids.food, ids.shop);
    money(db, ids.account, "2026-03-02", -900, ids.food, ids.shop);
    const refund = approved(db, ids, "2026-03-10", 2_000);
    const stored = getTransaction(db, refund.id);
    expect(stored?.refundOfId).toBe(purchase.id);
    expect(stored?.merchantId).toBe(ids.shop);
    expect(stored?.lines[0]?.categoryId).toBe(ids.food);
    expect(stored?.autoReason).toBe("refund_match");
    expect(stored?.autoSourceId).toBe(purchase.id);
    const review = questionOf(db, refund.id);
    expect(review?.level).toBe("sure");
    expect(review?.question).toBe("categorize");
  });
});

test("two purchases with the same amount ask and do not link", () => {
  withBook((db, ids) => {
    const first = money(db, ids.account, "2026-03-01", -2_000, ids.food);
    const second = money(db, ids.account, "2026-03-05", -2_000, ids.food);
    const refund = money(db, ids.account, "2026-03-10", 2_000, ids.food);
    expect(getTransaction(db, refund.id)?.refundOfId).toBeNull();
    const review = questionOf(db, refund.id);
    expect(review?.question).toBe("refund_purchase");
    expect(review?.refund?.purchases.map((item) => item.id)).toEqual([second.id, first.id]);
  });
});

test("a purchase with a larger amount asks and does not link", () => {
  withBook((db, ids) => {
    const purchase = money(db, ids.account, "2026-03-01", -5_000, ids.food);
    const refund = money(db, ids.account, "2026-03-10", 2_000, ids.food);
    expect(getTransaction(db, refund.id)?.refundOfId).toBeNull();
    expect(questionOf(db, refund.id)?.refund?.purchases[0]?.id).toBe(purchase.id);
  });
});

test("Not linked to a purchase stays answered", () => {
  withBook((db, ids) => {
    money(db, ids.account, "2026-03-01", -5_000, ids.food);
    const refund = money(db, ids.account, "2026-03-10", 2_000, ids.food);
    const itemKey = `refund_link:${refund.id}`;
    decideInboxItem(db, asOf, itemKey, "not_linked", saved);
    expect(questionOf(db, refund.id)).toBeUndefined();
  });
});

test("the 90 day window includes day 90 and the refund day, and leaves out day 91", () => {
  withBook((db, ids) => {
    const edge = money(db, ids.account, "2026-01-09", -1_000, ids.food);
    const refund = approved(db, ids, "2026-04-09", 1_000);
    expect(getTransaction(db, refund.id)?.refundOfId).toBe(edge.id);
    const same = money(db, ids.account, "2026-04-20", -700, ids.food);
    const sameDay = approved(db, ids, "2026-04-20", 700);
    expect(getTransaction(db, sameDay.id)?.refundOfId).toBe(same.id);
  });
  withBook((db, ids) => {
    money(db, ids.account, "2026-01-08", -1_000, ids.food);
    const refund = approved(db, ids, "2026-04-09", 1_000);
    expect(getTransaction(db, refund.id)?.refundOfId).toBeNull();
    expect(questionOf(db, refund.id)).toBeUndefined();
  });
});

test("a purchase that is fully refunded is not a candidate", () => {
  withBook((db, ids) => {
    const purchase = money(db, ids.account, "2026-03-01", -2_000, ids.food);
    const first = approved(db, ids, "2026-03-10", 2_000);
    expect(getTransaction(db, first.id)?.refundOfId).toBe(purchase.id);
    const second = approved(db, ids, "2026-03-12", 2_000);
    expect(getTransaction(db, second.id)?.refundOfId).toBeNull();
    expect(questionOf(db, second.id)).toBeUndefined();
  });
});

test("a link that the person set is not changed", () => {
  withBook((db, ids) => {
    const chosen = money(db, ids.account, "2026-03-01", -4_000, ids.food);
    money(db, ids.account, "2026-03-02", -2_000, ids.food);
    const refund = createTransaction(db, {
      accountId: ids.account,
      date: "2026-03-10",
      amount: 2_000,
      payeeRaw: "Corner Shop",
      status: "cleared",
      lines: [{ amount: 2_000, categoryId: ids.food }],
      refundOfId: chosen.id,
      ...saved,
    });
    expect(getTransaction(db, refund.id)?.refundOfId).toBe(chosen.id);
    expect(getTransaction(db, refund.id)?.autoReason).toBeNull();
    updateTransaction(db, refund.id, {
      accountId: ids.account,
      date: "2026-03-10",
      amount: 2_000,
      payeeRaw: "Corner Shop",
      status: "cleared",
      lines: [{ amount: 2_000, categoryId: ids.food }],
      notes: "kept",
      ...saved,
    });
    expect(getTransaction(db, refund.id)?.refundOfId).toBe(chosen.id);
  });
});

test("a refund with no candidate has no question", () => {
  withBook((db, ids) => {
    const refund = money(db, ids.account, "2026-03-10", 2_000, ids.food);
    expect(questionOf(db, refund.id)).toBeUndefined();
  });
});

test("deleting the purchase removes the automatic label from its refund", () => {
  withBook((db, ids) => {
    const purchase = money(db, ids.account, "2026-03-01", -2_000, ids.food);
    const other = money(db, ids.account, "2026-03-02", -2_500, ids.food);
    const refund = approved(db, ids, "2026-03-10", 2_000);
    expect(getTransaction(db, refund.id)?.autoReason).toBe("refund_match");
    deleteTransaction(db, purchase.id, saved);
    const stored = getTransaction(db, refund.id);
    expect(stored?.refundOfId).toBeNull();
    expect(stored?.autoReason).toBeNull();
    expect(stored?.autoSourceId).toBeNull();
    expect(questionOf(db, refund.id)?.refund?.purchases.map((item) => item.id)).toEqual([other.id]);
  });
});

test("a category that the person picks does not start a link", () => {
  withBook((db, ids) => {
    const purchase = money(db, ids.account, "2026-03-01", -2_000, ids.food);
    const refund = money(db, ids.account, "2026-03-10", 2_000, ids.food);
    expect(getTransaction(db, refund.id)?.refundOfId).toBeNull();
    expect(questionOf(db, refund.id)?.refund?.purchases.map((item) => item.id)).toEqual([purchase.id]);
  });
});

test("Looks right on an automatic label can start the link", () => {
  withBook((db, ids) => {
    const purchase = money(db, ids.account, "2026-03-01", -2_000, ids.food);
    const refund = money(db, ids.account, "2026-03-10", 2_000, ids.food);
    db.update(transactions).set({ autoReason: "learned_payee", autoConfidence: 900 }).where(eq(transactions.id, refund.id)).run();
    acceptLooksRight(db, refund.id, saved);
    expect(getTransaction(db, refund.id)?.refundOfId).toBe(purchase.id);
  });
});

test("removing a link records Not linked to a purchase", () => {
  withBook((db, ids) => {
    const purchase = money(db, ids.account, "2026-03-01", -2_000, ids.food);
    const refund = approved(db, ids, "2026-03-10", 2_000);
    expect(getTransaction(db, refund.id)?.refundOfId).toBe(purchase.id);
    updateTransaction(db, refund.id, {
      accountId: ids.account,
      date: "2026-03-10",
      amount: 2_000,
      payeeRaw: "Corner Shop",
      status: "cleared",
      lines: [{ amount: 2_000, categoryId: ids.food }],
      refundOfId: null,
      ...saved,
    });
    expect(getTransaction(db, refund.id)?.refundOfId).toBeNull();
    expect(db.select().from(inboxDecisions).where(eq(inboxDecisions.itemKey, `refund_link:${refund.id}`)).get()?.decision).toBe("not_linked");
    expect(questionOf(db, refund.id)).toBeUndefined();
  });
});

test("a transfer question comes before the refund question", () => {
  withBook((db, ids) => {
    const savings = createAccount(db, { name: "Savings", kind: "chequing", openingDate: "2026-01-01", openingBalance: 0, ...saved });
    const left = money(db, ids.account, "2026-03-06", -5_000, ids.food);
    db.update(transactions).set({ source: "import" }).where(eq(transactions.id, left.id)).run();
    const right = money(db, savings.id, "2026-03-06", 5_000, ids.food);
    expect(questionOf(db, right.id)?.question).toBe("transfer_pair");
    const [low, high] = left.id < right.id ? [left.id, right.id] : [right.id, left.id];
    decideInboxItem(db, asOf, `transfer_pair:${low}:${high}`, "not_transfer", saved);
    expect(questionOf(db, right.id)?.question).toBe("refund_purchase");
  });
});
