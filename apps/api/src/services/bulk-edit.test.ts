import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog, migrateDatabase, openDatabase, settings, transactions } from "@num/db";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { bulkEdit } from "./bulk-edit";
import { createCategory } from "./categories";
import { decisionRows } from "./inbox-decisions";
import { createMerchant } from "./merchants";
import { listNeedsReview } from "./needs-review";
import { createTag } from "./tags";
import { createTransaction, getTransaction, updateTransaction } from "./transactions";

const at = "2026-10-08T15:00:00Z";
const saved = { source: "ui" as const, at };
const asOf = "2026-04-02";
const missingCategory = "99999999-9999-4999-8999-999999999999";

function withBook(run: (db: Db, ids: { cash: string; savings: string; food: string; salary: string }) => void) {
  const dir = mkdtempSync(join(tmpdir(), "num-bulk-edit-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "USD" }).run();
  try {
    const cash = createAccount(db, { name: "Cash", kind: "chequing", openingDate: "2026-01-01", openingBalance: 0, ...saved });
    const savings = createAccount(db, { name: "Savings", kind: "savings", openingDate: "2026-01-01", openingBalance: 0, ...saved });
    const food = createCategory(db, { name: "Food", kind: "expense", ...saved });
    const salary = createCategory(db, { name: "Salary", kind: "income", ...saved });
    run(db, { cash: cash.id, savings: savings.id, food: food.id, salary: salary.id });
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

type Line = { amount: number; categoryId?: string | null; transferAccountId?: string | null; tagIds?: string[] };

function pay(db: Db, accountId: string, date: string, amount: number, payee: string, options: { merchantId?: string; lines?: Line[] } = {}) {
  return createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw: payee,
    merchantId: options.merchantId ?? null,
    lines: options.lines ?? [{ amount }],
    ...saved,
  });
}

/** A loan payment: the interest on a category line and the principal on a transfer line to a loan (decision 0053). */
function loanPayment(db: Db, accountId: string, date: string, payee: string) {
  const loan = createAccount(db, { name: `Loan ${date}`, kind: "loan", openingDate: "2026-01-01", openingBalance: 0, ...saved });
  const interest = createCategory(db, { name: `Interest ${date}`, kind: "expense", ...saved });
  const payment = pay(db, accountId, date, -3000, payee, {
    lines: [
      { amount: -1000, categoryId: interest.id },
      { amount: -2000, transferAccountId: loan.id },
    ],
  });
  return { payment, interest };
}

function auditsAt(db: Db, time: string) {
  return db.select().from(auditLog).where(eq(auditLog.at, time)).all();
}

/** A possible transfer: an imported row in Cash and the opposite row in Savings on the same day. */
function pairOf(db: Db, ids: { cash: string; savings: string }) {
  const left = pay(db, ids.cash, "2026-03-06", -50_000, "Move");
  db.update(transactions).set({ source: "import" }).where(eq(transactions.id, left.id)).run();
  const right = pay(db, ids.savings, "2026-03-06", 50_000, "Savings deposit");
  return { left, right };
}

test("a failure writes nothing, and only the selected rows change", () => {
  withBook((db, ids) => {
    const kept = pay(db, ids.cash, "2026-03-01", -4000, "Blue Bottle");
    const other = pay(db, ids.cash, "2026-03-02", -4200, "SQ *BLUE BOTTLE");
    const failAt = "2026-10-08T17:00:00Z";
    expect(() =>
      bulkEdit(db, asOf, { transactionIds: [kept.id], what: { kind: "category", categoryId: missingCategory }, source: "ui", at: failAt }),
    ).toThrow();
    expect(getTransaction(db, kept.id)?.lines[0]?.categoryId).toBeNull();
    expect(auditsAt(db, failAt)).toHaveLength(0);

    const result = bulkEdit(db, asOf, { transactionIds: [kept.id], what: { kind: "category", categoryId: ids.food }, ...saved });
    expect(result).toEqual({ changed: 1, skipped: [] });
    expect(getTransaction(db, kept.id)?.lines[0]?.categoryId).toBe(ids.food);
    expect(getTransaction(db, other.id)?.lines[0]?.categoryId).toBeNull();
  });
});

test("a transfer skips a loan payment, the transfer target and a row of another account", () => {
  withBook((db, ids) => {
    const open = pay(db, ids.cash, "2026-03-01", -4000, "Cafe");
    const loan = loanPayment(db, ids.cash, "2026-03-03", "Cafe").payment;
    const target = pay(db, ids.savings, "2026-03-04", -700, "Cafe");
    const visa = createAccount(db, { name: "Other", kind: "chequing", openingDate: "2026-01-01", openingBalance: 0, ...saved });
    const elsewhere = pay(db, visa.id, "2026-03-05", -900, "Cafe");
    const result = bulkEdit(db, asOf, {
      transactionIds: [open.id, loan.id, target.id, elsewhere.id],
      what: { kind: "transfer", accountId: ids.cash, transferAccountId: ids.savings },
      ...saved,
    });
    expect(result.changed).toBe(1);
    expect(result.skipped).toEqual([
      { id: loan.id, reason: "loan_payment" },
      { id: target.id, reason: "transfer_target" },
      { id: elsewhere.id, reason: "other_account" },
    ]);
    expect(getTransaction(db, open.id)?.lines[0]?.transferAccountId).toBe(ids.savings);
  });
});

test("a category skips the wrong direction and a row with no change", () => {
  withBook((db, ids) => {
    const early = pay(db, ids.cash, "2026-02-01", 500, "Pay");
    const income = pay(db, ids.cash, "2026-03-06", 9000, "Pay");
    const done = pay(db, ids.cash, "2026-03-07", 1000, "Pay", { lines: [{ amount: 1000, categoryId: ids.salary }] });
    const out = pay(db, ids.cash, "2026-03-08", -1000, "Shop");
    const result = bulkEdit(db, asOf, {
      transactionIds: [early.id, income.id, done.id, out.id],
      what: { kind: "category", categoryId: ids.salary },
      ...saved,
    });
    expect(result).toEqual({
      changed: 2,
      skipped: [
        { id: done.id, reason: "unchanged" },
        { id: out.id, reason: "direction" },
      ],
    });
    expect(getTransaction(db, early.id)?.lines[0]?.categoryId).toBe(ids.salary);
    expect(getTransaction(db, out.id)?.lines[0]?.categoryId).toBeNull();
  });
});

test("a selection in which each row is skipped writes nothing", () => {
  withBook((db, ids) => {
    const loan = loanPayment(db, ids.cash, "2026-03-02", "Blue Bottle").payment;
    const skipAt = "2026-10-08T19:00:00Z";
    const result = bulkEdit(db, asOf, { transactionIds: [loan.id], what: { kind: "category", categoryId: ids.food }, source: "ui", at: skipAt });
    expect(result).toEqual({ changed: 0, skipped: [{ id: loan.id, reason: "loan_payment" }] });
    expect(auditsAt(db, skipAt)).toHaveLength(0);
  });
});

test("a field with no change keeps its value, tags are added and removed, and a transfer clears the merchant", () => {
  withBook((db, ids) => {
    const shop = createMerchant(db, { name: "Cafe", ...saved });
    const trip = createTag(db, { name: "Trip", ...saved });
    const work = createTag(db, { name: "Work", ...saved });
    const home = createTag(db, { name: "Home", ...saved });
    const row = pay(db, ids.cash, "2026-03-01", -5000, "Cafe", { merchantId: shop.id, lines: [{ amount: -5000, tagIds: [trip.id, home.id] }] });

    bulkEdit(db, asOf, { transactionIds: [row.id], what: { kind: "category", categoryId: ids.food }, ...saved });
    expect(getTransaction(db, row.id)?.merchantId).toBe(shop.id);

    bulkEdit(db, asOf, { transactionIds: [row.id], addTagIds: [work.id, trip.id], removeTagIds: [home.id], ...saved });
    const tagged = getTransaction(db, row.id);
    expect(tagged?.lines[0]?.tagIds.toSorted()).toEqual([trip.id, work.id].toSorted());
    expect(tagged?.lines[0]?.categoryId).toBe(ids.food);
    expect(tagged?.merchantId).toBe(shop.id);

    bulkEdit(db, asOf, { transactionIds: [row.id], merchantId: null, ...saved });
    expect(getTransaction(db, row.id)?.merchantId).toBeNull();
    expect(getTransaction(db, row.id)?.lines[0]?.categoryId).toBe(ids.food);

    bulkEdit(db, asOf, { transactionIds: [row.id], merchantId: shop.id, ...saved });
    bulkEdit(db, asOf, { transactionIds: [row.id], what: { kind: "transfer", accountId: ids.cash, transferAccountId: ids.savings }, ...saved });
    const moved = getTransaction(db, row.id);
    expect(moved?.merchantId).toBeNull();
    expect(moved?.lines[0]?.transferAccountId).toBe(ids.savings);
    expect(moved?.lines[0]?.tagIds.toSorted()).toEqual([trip.id, work.id].toSorted());
  });
});

test("each changed row has one audit entry, and the change confirms an automatic label", () => {
  withBook((db, ids) => {
    const tag = createTag(db, { name: "Trip", ...saved });
    const first = pay(db, ids.cash, "2026-03-01", -4000, "Cafe");
    const second = pay(db, ids.cash, "2026-03-02", -4200, "Cafe", { lines: [{ amount: -4200, categoryId: ids.food }] });
    db.update(transactions).set({ autoReason: "learned_amount", autoConfidence: 900, autoSourceId: first.id }).where(eq(transactions.id, second.id)).run();
    const editAt = "2026-10-08T20:00:00Z";
    expect(bulkEdit(db, asOf, { transactionIds: [first.id, second.id], addTagIds: [tag.id], source: "ui", at: editAt }).changed).toBe(2);
    for (const id of [first.id, second.id]) {
      const entries = db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.at, editAt), eq(auditLog.entity, "transactions"), eq(auditLog.entityId, id)))
        .all();
      expect(entries).toHaveLength(1);
    }
    expect(getTransaction(db, second.id)?.autoReason).toBeNull();
  });
});

test("a category on a row with a question records the no answer", () => {
  withBook((db, ids) => {
    const { left, right } = pairOf(db, ids);
    pay(db, ids.cash, "2026-03-01", -20_000, "Corner Shop", { lines: [{ amount: -20_000, categoryId: ids.food }] });
    pay(db, ids.cash, "2026-03-05", -20_000, "Corner Shop", { lines: [{ amount: -20_000, categoryId: ids.food }] });
    const refund = pay(db, ids.cash, "2026-03-10", 20_000, "Corner Shop", { lines: [{ amount: 20_000, categoryId: ids.food }] });
    const questions = new Map(listNeedsReview(db, asOf).map((hit) => [hit.id, hit.review.question]));
    expect(questions.get(left.id)).toBe("transfer_pair");
    expect(questions.get(refund.id)).toBe("refund_purchase");

    // The refund keeps its category: the answer is still "no purchase".
    const result = bulkEdit(db, asOf, { transactionIds: [left.id, refund.id], what: { kind: "category", categoryId: ids.food }, ...saved });
    expect(result).toEqual({ changed: 2, skipped: [] });
    const [low, high] = left.id < right.id ? [left.id, right.id] : [right.id, left.id];
    expect(decisionRows(db).map((row) => [row.itemKey, row.decision]).toSorted()).toEqual(
      [
        [`transfer_pair:${low}:${high}`, "not_transfer"],
        [`refund_link:${refund.id}`, "not_linked"],
      ].toSorted(),
    );
    const after = new Set(listNeedsReview(db, asOf).map((hit) => hit.id));
    expect(after.has(left.id)).toBe(false);
    expect(after.has(refund.id)).toBe(false);
  });
});

test("a merchant or tags alone do not answer a question", () => {
  withBook((db, ids) => {
    const { left } = pairOf(db, ids);
    const tag = createTag(db, { name: "Trip", ...saved });
    expect(bulkEdit(db, asOf, { transactionIds: [left.id], addTagIds: [tag.id], ...saved }).changed).toBe(1);
    expect(decisionRows(db)).toEqual([]);
    expect(listNeedsReview(db, asOf).find((hit) => hit.id === left.id)?.review.question).toBe("transfer_pair");
  });
});

test("a transfer to the account of a proposed pair links the pair", () => {
  withBook((db, ids) => {
    const { left, right } = pairOf(db, ids);
    const result = bulkEdit(db, asOf, {
      transactionIds: [left.id],
      what: { kind: "transfer", accountId: ids.cash, transferAccountId: ids.savings },
      ...saved,
    });
    expect(result.changed).toBe(1);
    expect(getTransaction(db, left.id)?.transferPeerId).toBe(right.id);
    expect(getTransaction(db, right.id)?.transferPeerId).toBe(left.id);
  });
});

test("saving one transaction does not fill a loan payment", () => {
  withBook((db, ids) => {
    const current = pay(db, ids.cash, "2026-03-01", -4000, "Blue Bottle");
    const other = pay(db, ids.cash, "2026-03-02", -4200, "SQ *BLUE BOTTLE");
    const loan = loanPayment(db, ids.cash, "2026-03-03", "blue bottle");
    const ruleAt = "2026-10-08T21:00:00Z";
    expect(() =>
      updateTransaction(db, current.id, {
        lines: [{ amount: current.amount, categoryId: missingCategory, memo: null, transferAccountId: null, tagIds: [] }],
        source: "ui",
        at: ruleAt,
      }),
    ).toThrow();
    expect(auditsAt(db, ruleAt)).toHaveLength(0);

    const savedRow = updateTransaction(db, current.id, {
      lines: [{ amount: current.amount, categoryId: ids.food, memo: null, transferAccountId: null, tagIds: [] }],
      source: "ui",
      at: "2026-10-08T22:00:00Z",
    });
    expect(savedRow.lines[0]?.categoryId).toBe(ids.food);
    expect(getTransaction(db, other.id)?.lines[0]?.categoryId).toBeNull();
    expect(getTransaction(db, loan.payment.id)?.lines.map((line) => line.categoryId)).toEqual([loan.interest.id, null]);
  });
});
