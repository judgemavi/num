import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importBatches, migrateDatabase, openDatabase, settings, transactions } from "@num/db";
import { columnMapSchema, planProposalKey, type ColumnMap, type InboxDecisionCode } from "@num/shared";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db";
import { ServiceError } from "../service-error";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { importStatement } from "./imports";
import { openUnreadableKeys } from "./book-settings";
import { openFundingPaychecks } from "./funding-paychecks";
import { decideInboxItem, undoInboxDecision } from "./inbox-decisions";
import { decidedKeys } from "./decision-keys";
import { listNeedsReview } from "./needs-review";
import { recurringSignals } from "./recurring-view";
import { createMerchant } from "./merchants";
import { linkOccurrence, restoreSkip, skipOccurrence } from "./recurring-links";
import { createPlan } from "./recurring-plans";
import { createTransaction } from "./transactions";

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
  const dir = mkdtempSync(join(tmpdir(), "num-inbox-decision-"));
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
    openingBalance: 10_000_000,
    ...saved,
  });
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

function hasKey(db: Db, asOfDate: string, itemKey: string): boolean {
  if (listNeedsReview(db, asOfDate).some((hit) => hit.review.itemKey === itemKey)) {
    return true;
  }
  const signals = recurringSignals(db, asOfDate);
  if (signals.missed.some((item) => `recurring_missed:${item.planId}:${item.dueDate}` === itemKey)) {
    return true;
  }
  // The Recurring screen shows a changed amount until its decision (decision 0047).
  const changed = signals.changed.some((item) => `recurring_changed:${item.planId}:${item.dueDate}` === itemKey);
  if (changed && !decidedKeys(db).has(itemKey)) {
    return true;
  }
  if (signals.proposals.some((item) => planProposalKey(item) === itemKey)) {
    return true;
  }
  if (openFundingPaychecks(db).some((item) => `paycheck_funding:${item.incomeTransactionId}` === itemKey)) {
    return true;
  }
  return openUnreadableKeys(db).includes(itemKey);
}

function roundTrip(db: Db, asOfDate: string, itemKey: string, decision: InboxDecisionCode) {
  expect(hasKey(db, asOfDate, itemKey)).toBe(true);
  decideInboxItem(db, asOfDate, itemKey, decision, saved);
  expect(hasKey(db, asOfDate, itemKey)).toBe(false);
  undoInboxDecision(db, itemKey, saved);
  expect(hasKey(db, asOfDate, itemKey)).toBe(true);
}

test("each no decision hides its review item until undo", () => {
  const sample = book();
  try {
    const cash = account(sample.db, "Cash");
    const savings = account(sample.db, "Savings");
    const food = createCategory(sample.db, { name: "Food", kind: "expense", essential: false, ...saved });
    const left = pay(sample.db, cash.id, "2026-03-05", -500_000, "Move", food.id);
    sample.db.update(transactions).set({ source: "import" }).where(eq(transactions.id, left.id)).run();
    const right = pay(sample.db, savings.id, "2026-03-06", 500_000, "Move", food.id);
    const pairKey = left.id < right.id ? `transfer_pair:${left.id}:${right.id}` : `transfer_pair:${right.id}:${left.id}`;
    roundTrip(sample.db, asOf, pairKey, "not_transfer");

    const changedPlan = createPlan(sample.db, {
      name: "Stream",
      kind: "bill",
      accountId: cash.id,
      expectedAmount: -10000,
      tolerance: 0,
      amountMode: "fixed",
      categoryId: null,
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
    const changedPay = pay(sample.db, cash.id, "2026-03-15", -19990, "Stream", food.id);
    linkOccurrence(sample.db, changedPlan.id, "2026-03-15", changedPay.id, saved);
    roundTrip(sample.db, asOf, `recurring_changed:${changedPlan.id}:2026-03-15`, "keep_plan_amount");

    const missedPlan = createPlan(sample.db, {
      name: "Gym",
      kind: "bill",
      accountId: cash.id,
      expectedAmount: -10000,
      tolerance: 0,
      amountMode: "fixed",
      categoryId: null,
      transferAccountId: null,
      merchantId: null,
      startDate: "2026-01-15",
      freq: "monthly",
      interval: 1,
      monthDay: 15,
      businessDayShift: "none",
      endDate: null,
      active: true,
      fundsBuckets: false,
      ...saved,
    });
    const missedKey = `recurring_missed:${missedPlan.id}:2026-02-15`;
    expect(hasKey(sample.db, asOf, missedKey)).toBe(true);
    skipOccurrence(sample.db, missedPlan.id, "2026-02-15", "Away", saved);
    expect(hasKey(sample.db, asOf, missedKey)).toBe(false);
    restoreSkip(sample.db, missedPlan.id, "2026-02-15", saved);
    expect(hasKey(sample.db, asOf, missedKey)).toBe(true);

    const stream = createMerchant(sample.db, { name: "Stream Co", ...saved });
    for (const date of ["2026-01-15", "2026-02-15", "2026-03-15"]) {
      pay(sample.db, savings.id, date, -15000, "Stream", food.id, stream.id);
    }
    const proposal = recurringSignals(sample.db, asOf).proposals[0];
    expect(proposal).toBeDefined();
    if (proposal) {
      roundTrip(sample.db, asOf, planProposalKey(proposal), "not_recurring");
    }

    const payCategory = createCategory(sample.db, { name: "Pay", kind: "income", essential: false, ...saved });
    const paycheckPlan = createPlan(sample.db, {
      name: "Pay",
      kind: "income",
      accountId: cash.id,
      expectedAmount: 500_000,
      tolerance: 0,
      amountMode: "fixed",
      categoryId: payCategory.id,
      transferAccountId: null,
      merchantId: null,
      startDate: "2026-03-01",
      freq: "monthly",
      interval: 1,
      monthDay: 1,
      businessDayShift: "none",
      endDate: "2026-03-01",
      active: true,
      fundsBuckets: true,
      ...saved,
    });
    const deposit = pay(sample.db, cash.id, "2026-03-01", 500_000, "Payroll", payCategory.id);
    linkOccurrence(sample.db, paycheckPlan.id, "2026-03-01", deposit.id, saved);
    roundTrip(sample.db, asOf, `paycheck_funding:${deposit.id}`, "keep_unassigned");

    importStatement(sample.db, sample.dir, {
      source: "import",
      at,
      accountId: cash.id,
      filename: "bad.csv",
      mimeType: "text/csv",
      bytes: new TextEncoder().encode("date,description,amount\n03/01/2026,GOOD ROW,-1.00\nxx/yy/2026,BAD ROW,1.00\n"),
      columnMap: map,
    });
    const unreadableKey = openUnreadableKeys(sample.db)[0] ?? "";
    expect(unreadableKey).not.toBe("");
    const [, batchId = "", line = ""] = unreadableKey.split(":");
    roundTrip(sample.db, asOf, unreadableKey, "not_a_transaction");
    decideInboxItem(sample.db, asOf, unreadableKey, "not_a_transaction", saved);
    expect(hasKey(sample.db, asOf, unreadableKey)).toBe(false);
    undoInboxDecision(sample.db, unreadableKey, saved);
    const body = {
      accountId: cash.id,
      date: "2026-03-02",
      amount: 1000,
      payeeRaw: "By hand",
      status: "open" as const,
      lines: [{ amount: 1000, categoryId: null, memo: null, transferAccountId: null, tagIds: [] }],
      ...saved,
    };
    const count = () => sample.db.select().from(transactions).all().length;
    const total = count();
    expect(() => createTransaction(sample.db, { ...body, unreadableItemKey: `import_unreadable:${batchId}:999` })).toThrow(ServiceError);
    expect(count()).toBe(total);
    createTransaction(sample.db, { ...body, unreadableItemKey: unreadableKey });
    expect(count()).toBe(total + 1);
    expect(hasKey(sample.db, asOf, unreadableKey)).toBe(false);
    const batch = sample.db.select().from(importBatches).where(eq(importBatches.id, batchId)).get();
    expect((batch?.unreadableJson ?? []).some((row) => String(row.line) === line)).toBe(false);

    expect(() => decideInboxItem(sample.db, asOf, `transfer_pair:${crypto.randomUUID()}:${crypto.randomUUID()}`, "not_transfer", saved)).toThrow(
      ServiceError,
    );
  } finally {
    sample.close();
  }
});
