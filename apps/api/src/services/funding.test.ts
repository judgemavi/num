import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bucketEvents, fundingRuns, migrateDatabase, openDatabase } from "@num/db";
import { eq } from "drizzle-orm";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { ServiceError } from "../service-error";
import { createAccount } from "./accounts";
import { createBucketEvent, undoBucketEvent } from "./bucket-events";
import { createBucket, readBucket } from "./buckets";
import { createCategory } from "./categories";
import { fundingPosition, fundingProposalFor, listFundingPaychecks } from "./funding-book";
import { createFundingRun, undoFundingRun } from "./funding-runs";
import { linkOccurrence } from "./recurring-links";
import { createPlan } from "./recurring-plans";
import { createTransaction } from "./transactions";

const at = "2026-10-07T16:00:00Z";
const saved = { source: "ui" as const, at };

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-funding-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  return {
    db: createDb(sqlite),
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function account(db: Db, name: string, kind: "chequing" | "credit_card" | "property", openingBalance: number) {
  return createAccount(db, {
    name,
    kind,
    openingDate: "2026-01-01",
    openingBalance,
    paymentPolicy: kind === "credit_card" ? "manual" : null,
    ...saved,
  });
}

function plan(
  db: Db,
  input: {
    name: string;
    kind: "income" | "bill";
    accountId: string;
    expectedAmount: number;
    amountMode?: "fixed" | "variable";
    startDate: string;
    freq: "weekly" | "monthly";
    interval: number;
    monthDay?: number;
    fundsBuckets: boolean;
  },
) {
  return createPlan(db, {
    ...input,
    amountMode: input.amountMode ?? "fixed",
    tolerance: 0,
    businessDayShift: "none",
    active: true,
    ...saved,
  });
}

function money(db: Db, accountId: string, categoryId: string, date: string, amount: number, payeeRaw: string) {
  return createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw,
    status: "open",
    lines: [{ amount, categoryId }],
    ...saved,
  });
}

test("a variable paycheck uses its actual amount", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 1_000_000);
    const pay = createCategory(book.db, { name: "Pay", kind: "income", ...saved });
    const paycheck = plan(book.db, {
      name: "Pay",
      kind: "income",
      accountId: cash.id,
      expectedAmount: 10_000,
      amountMode: "variable",
      startDate: "2026-10-01",
      freq: "weekly",
      interval: 2,
      fundsBuckets: true,
    });
    const deposit = money(book.db, cash.id, pay.id, "2026-10-01", 25_000, "Payroll");
    linkOccurrence(book.db, paycheck.id, "2026-10-01", deposit.id, saved);
    const food = createBucket(book.db, {
      name: "Food",
      kind: "spending",
      priority: 1,
      essential: false,
      color: "mint",
      icon: "utensils",
      categoryIds: [],
      refillTo: 40_000,
      amount: null,
      dueDate: null,
      repeat: null,
      target: null,
      targetDate: null,
      fixedAmount: null,
      ...saved,
    });
    createBucket(book.db, {
      name: "Trip",
      kind: "goal",
      priority: 2,
      essential: false,
      color: "sky",
      icon: "plane",
      categoryIds: [],
      refillTo: null,
      amount: null,
      dueDate: null,
      repeat: null,
      target: 100_000,
      targetDate: null,
      fixedAmount: 5_000,
      ...saved,
    });
    const proposal = fundingProposalFor(book.db, deposit.id, "2026-10-01");
    expect(proposal.paycheckAmount).toBe(25_000);
    expect(proposal.limit).toBe(25_000);
    expect(proposal.lines).toEqual([{ bucketId: food.id, name: "Food", amount: 25_000 }]);
  } finally {
    book.close();
  }
});

test("a card purchase does not change Unassigned", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 20_000);
    const card = account(book.db, "Card", "credit_card", 0);
    account(book.db, "House", "property", 9_000_000);
    const groceries = createCategory(book.db, { name: "Groceries", kind: "expense", ...saved });
    const food = createBucket(book.db, {
      name: "Food",
      kind: "spending",
      priority: 1,
      essential: false,
      color: "mint",
      icon: "shopping-cart",
      categoryIds: [groceries.id],
      refillTo: 10_000,
      amount: null,
      dueDate: null,
      repeat: null,
      target: null,
      targetDate: null,
      fixedAmount: null,
      ...saved,
    });
    createBucketEvent(book.db, food.id, { kind: "fund", amount: 5_000, date: "2026-10-01", ...saved });
    expect(fundingPosition(book.db, "2026-10-01").unassigned).toBe(15_000);
    money(book.db, card.id, groceries.id, "2026-10-02", -2_000, "Shop");
    const after = fundingPosition(book.db, "2026-10-02");
    expect(after.onBudgetTotal).toBe(18_000);
    expect(after.unassigned).toBe(15_000);
    createTransaction(book.db, {
      accountId: cash.id,
      date: "2026-10-03",
      amount: -2_000,
      payeeRaw: "Card payment",
      status: "open",
      lines: [{ amount: -2_000, transferAccountId: card.id }],
      ...saved,
    });
    expect(fundingPosition(book.db, "2026-10-03").unassigned).toBe(15_000);
  } finally {
    book.close();
  }
});

test("bills reserved stop at the next funds paycheck, or cover 30 days", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 10_000);
    plan(book.db, {
      name: "Pay",
      kind: "income",
      accountId: cash.id,
      expectedAmount: 20_000,
      startDate: "2026-10-15",
      freq: "weekly",
      interval: 2,
      fundsBuckets: true,
    });
    plan(book.db, {
      name: "Power",
      kind: "bill",
      accountId: cash.id,
      expectedAmount: -300,
      startDate: "2026-10-10",
      freq: "monthly",
      interval: 1,
      monthDay: 10,
      fundsBuckets: false,
    });
    plan(book.db, {
      name: "Rent",
      kind: "bill",
      accountId: cash.id,
      expectedAmount: -500,
      startDate: "2026-10-15",
      freq: "monthly",
      interval: 1,
      monthDay: 15,
      fundsBuckets: false,
    });
    const phone = plan(book.db, {
      name: "Phone",
      kind: "bill",
      accountId: cash.id,
      expectedAmount: -400,
      startDate: "2026-10-10",
      freq: "monthly",
      interval: 1,
      monthDay: 10,
      fundsBuckets: false,
    });
    const paid = money(book.db, cash.id, createCategory(book.db, { name: "Phone", kind: "expense", ...saved }).id, "2026-10-10", -400, "Phone Co");
    linkOccurrence(book.db, phone.id, "2026-10-10", paid.id, saved);
    const reserved = fundingPosition(book.db, "2026-10-01");
    expect(reserved.nextIncomeDate).toBe("2026-10-15");
    expect(reserved.billsReserved).toBe(300);
    expect(reserved.onBudgetTotal).toBe(9_600);
    expect(reserved.unassigned).toBe(9_300);
  } finally {
    book.close();
  }
});

test("with no funds paycheck, bills cover the next 30 days", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 0);
    plan(book.db, {
      name: "Soon",
      kind: "bill",
      accountId: cash.id,
      expectedAmount: -700,
      startDate: "2026-10-30",
      freq: "monthly",
      interval: 1,
      monthDay: 30,
      fundsBuckets: false,
    });
    plan(book.db, {
      name: "Later",
      kind: "bill",
      accountId: cash.id,
      expectedAmount: -800,
      startDate: "2026-10-31",
      freq: "monthly",
      interval: 1,
      monthDay: 31,
      fundsBuckets: false,
    });
    expect(fundingPosition(book.db, "2026-10-01").billsReserved).toBe(700);
  } finally {
    book.close();
  }
});

test("undo of a funding run removes every event from the balances", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "chequing", 50_000);
    const pay = createCategory(book.db, { name: "Pay", kind: "income", ...saved });
    const paycheck = plan(book.db, {
      name: "Pay",
      kind: "income",
      accountId: cash.id,
      expectedAmount: 50_000,
      startDate: "2026-10-01",
      freq: "monthly",
      interval: 1,
      monthDay: 1,
      fundsBuckets: true,
    });
    const deposit = money(book.db, cash.id, pay.id, "2026-10-01", 50_000, "Payroll");
    linkOccurrence(book.db, paycheck.id, "2026-10-01", deposit.id, saved);
    const food = createBucket(book.db, {
      name: "Food",
      kind: "spending",
      priority: 1,
      essential: false,
      color: "mint",
      icon: "utensils",
      categoryIds: [],
      refillTo: 10_000,
      amount: null,
      dueDate: null,
      repeat: null,
      target: null,
      targetDate: null,
      fixedAmount: null,
      ...saved,
    });
    const fuel = createBucket(book.db, {
      name: "Fuel",
      kind: "spending",
      priority: 2,
      essential: false,
      color: "sky",
      icon: "fuel",
      categoryIds: [],
      refillTo: 10_000,
      amount: null,
      dueDate: null,
      repeat: null,
      target: null,
      targetDate: null,
      fixedAmount: null,
      ...saved,
    });
    const run = createFundingRun(book.db, {
      incomeTransactionId: deposit.id,
      lines: [
        { bucketId: food.id, amount: 1_000 },
        { bucketId: fuel.id, amount: 2_000 },
      ],
      asOf: "2026-10-01",
      ...saved,
    });
    expect(readBucket(book.db, food.id).balance).toBe(1_000);
    expect(readBucket(book.db, fuel.id).balance).toBe(2_000);
    const events = book.db.select().from(bucketEvents).all();
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.fundingRunId === run.id && event.undoneAt === null)).toBe(true);
    const foodEvent = events.find((event) => event.bucketId === food.id);
    expect(foodEvent).toBeDefined();
    expect(() => undoBucketEvent(book.db, food.id, foodEvent?.id ?? "", saved)).toThrow(ServiceError);
    const undone = undoFundingRun(book.db, run.id, saved);
    expect(undone.undoneAt).toBe(at);
    expect(readBucket(book.db, food.id).balance).toBe(0);
    expect(readBucket(book.db, fuel.id).balance).toBe(0);
    const kept = book.db.select().from(bucketEvents).all();
    expect(kept.every((event) => event.undoneAt === null)).toBe(true);
    expect(book.db.select().from(fundingRuns).where(eq(fundingRuns.id, run.id)).get()?.undoneAt).toBe(at);
    expect(listFundingPaychecks(book.db).items.map((item) => item.incomeTransactionId)).toContain(deposit.id);
    const again = createFundingRun(book.db, {
      incomeTransactionId: deposit.id,
      lines: [{ bucketId: food.id, amount: 500 }],
      asOf: "2026-10-01",
      ...saved,
    });
    expect(readBucket(book.db, food.id).balance).toBe(500);
    expect(again.undoneAt).toBeNull();
  } finally {
    book.close();
  }
});
