import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { categories, migrateDatabase, openDatabase, settings, transactionLines, transactions } from "@num/db";
import type { TransactionCreate } from "@num/shared";
import { eq } from "drizzle-orm";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createCategory, createCategoryGroup } from "./categories";
import { createTag } from "./tags";
import { readInsights } from "./insights";
import { createTransaction } from "./transactions";

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-insights-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "CAD" }).run();
  return {
    db,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const saved = { source: "ui" as const, at: "2026-06-30T16:00:00Z" };

function account(db: Db, name: string, kind: "chequing" | "savings" | "property" | "mortgage", openingDate: string, openingBalance = 0) {
  return createAccount(db, { asOf: "2026-10-07", name, kind, openingDate, openingBalance, ...saved });
}

function spend(
  db: Db,
  input: {
    accountId: string;
    date: string;
    amount: number;
    categoryId?: string | null;
    merchantId?: string | null;
    transferAccountId?: string | null;
    tagIds?: string[];
  },
) {
  const line = {
    amount: input.amount,
    memo: null,
    categoryId: input.transferAccountId ? null : (input.categoryId ?? null),
    transferAccountId: input.transferAccountId ?? null,
    tagIds: input.tagIds ?? [],
  };
  const body: TransactionCreate & typeof saved = {
    accountId: input.accountId,
    date: input.date,
    amount: input.amount,
    merchantId: input.merchantId ?? null,
    payeeRaw: "Example shop",
    lines: [line],
    ...saved,
  };
  return createTransaction(db, body);
}

function rawClassified(db: Db) {
  const rows = db
    .select({
      amount: transactionLines.amount,
      categoryId: transactionLines.categoryId,
      kind: categories.kind,
      transferAccountId: transactionLines.transferAccountId,
    })
    .from(transactionLines)
    .innerJoin(transactions, eq(transactionLines.transactionId, transactions.id))
    .leftJoin(categories, eq(transactionLines.categoryId, categories.id))
    
    .all();
  let raw = 0;
  let spending = 0;
  let income = 0;
  let uncategorized = 0;
  for (const row of rows) {
    raw += row.amount;
    if (row.transferAccountId !== null) {
      continue;
    }
    if (row.kind === "expense" && row.categoryId !== null) {
      spending -= row.amount;
    } else if (row.kind === "income" && row.categoryId !== null) {
      income += row.amount;
    } else if (row.categoryId === null) {
      uncategorized += row.amount;
    }
  }
  return { raw, spending, income, uncategorized };
}

test("group totals: refunds reduce spending, transfers are excluded, No group and Uncategorized are rows", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing", "2026-01-01");
    const savings = account(book.db, "Savings", "savings", "2026-01-01");
    const home = createCategoryGroup(book.db, { name: "Home", ...saved });
    const groceries = createCategory(book.db, { name: "Groceries", kind: "expense", groupId: home.id, ...saved });
    const repairs = createCategory(book.db, { name: "Repairs", kind: "expense", groupId: home.id, ...saved });
    const fun = createCategory(book.db, { name: "Fun", kind: "expense", ...saved });
    const pay = createCategory(book.db, { name: "Pay", kind: "income", ...saved });
    spend(book.db, { accountId: chequing.id, date: "2026-06-02", amount: -100_000, categoryId: groceries.id });
    spend(book.db, { accountId: chequing.id, date: "2026-06-03", amount: 25_000, categoryId: groceries.id });
    spend(book.db, { accountId: chequing.id, date: "2026-06-03", amount: 10_000, categoryId: repairs.id });
    spend(book.db, { accountId: chequing.id, date: "2026-06-04", amount: 400_000, categoryId: pay.id });
    spend(book.db, { accountId: chequing.id, date: "2026-06-05", amount: -80_000, transferAccountId: savings.id });
    spend(book.db, { accountId: chequing.id, date: "2026-06-06", amount: -30_000 });
    spend(book.db, {
      accountId: chequing.id,
      date: "2026-06-07",
      amount: -20_000,
      categoryId: fun.id,
    });

    const sums = rawClassified(book.db);
    const query = { asOf: "2026-06-30", window: "1" } as const;
    const report = readInsights(book.db, query);
    expect(report.range).toEqual({ from: "2026-06-01", to: "2026-06-30" });
    expect(report.spending).toBe(sums.spending);
    expect(report.income).toBe(sums.income);
    expect(report.spending).toBe(85_000);
    expect(report.groups).toEqual([
      {
        id: home.id,
        kind: "item",
        amount: 65_000,
        inflow: null,
        color: home.color,
        categories: [
          { id: groceries.id, kind: "item", amount: 75_000, inflow: null },
          { id: repairs.id, kind: "item", amount: -10_000, inflow: null },
        ],
      },
      { id: null, kind: "none", color: null, amount: 20_000, inflow: null, categories: [{ id: fun.id, kind: "item", amount: 20_000, inflow: null }] },
      { id: null, kind: "uncategorized", color: null, amount: 30_000, inflow: 0, categories: [] },
    ]);
    expect(sums.uncategorized).toBe(-30_000);
    expect(readInsights(book.db, { ...query, category: groceries.id }).groups).toEqual(report.groups);
  } finally {
    book.close();
  }
});

test("groups and their categories are largest first, and the order does not depend on the line order", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing", "2026-01-01");
    const bills = createCategoryGroup(book.db, { name: "Bills", ...saved });
    const food = createCategoryGroup(book.db, { name: "Food", ...saved });
    const rent = createCategory(book.db, { name: "Rent", kind: "expense", groupId: bills.id, ...saved });
    const power = createCategory(book.db, { name: "Power", kind: "expense", groupId: bills.id, ...saved });
    const dining = createCategory(book.db, { name: "Dining", kind: "expense", groupId: food.id, ...saved });
    const refunded = createCategory(book.db, { name: "Refunded", kind: "expense", groupId: food.id, ...saved });
    spend(book.db, { accountId: chequing.id, date: "2026-06-02", amount: -20_000, categoryId: power.id });
    spend(book.db, { accountId: chequing.id, date: "2026-06-03", amount: -50_000, categoryId: dining.id });
    spend(book.db, { accountId: chequing.id, date: "2026-06-04", amount: -90_000, categoryId: rent.id });
    spend(book.db, { accountId: chequing.id, date: "2026-06-05", amount: 5_000, categoryId: refunded.id });
    const { groups } = readInsights(book.db, { asOf: "2026-06-30", window: "1" });
    expect(groups.map((row) => [row.id, row.amount])).toEqual([
      [bills.id, 110_000],
      [food.id, 45_000],
    ]);
    expect(groups[0]?.categories.map((row) => row.id)).toEqual([rent.id, power.id]);
    expect(groups[1]?.categories).toEqual([
      { id: dining.id, kind: "item", amount: 50_000, inflow: null },
      { id: refunded.id, kind: "item", amount: -5_000, inflow: null },
    ]);
  } finally {
    book.close();
  }
});

test("the window sets the period up to asOf, and a month limits the breakdowns", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing", "2025-01-01");
    const groceries = createCategory(book.db, { name: "Groceries", kind: "expense", ...saved });
    spend(book.db, { accountId: chequing.id, date: "2025-03-15", amount: -70_000, categoryId: groceries.id });
    spend(book.db, { accountId: chequing.id, date: "2026-02-10", amount: -40_000, categoryId: groceries.id });
    spend(book.db, { accountId: chequing.id, date: "2026-03-20", amount: -90_000, categoryId: groceries.id });

    const asOf = "2026-03-16";
    expect(readInsights(book.db, { asOf })).toMatchObject({ window: "1", to: asOf });
    expect(readInsights(book.db, { asOf, window: "6" })).toMatchObject({ window: "6", from: "2025-10-01", to: asOf, spending: 40_000 });
    expect(readInsights(book.db, { asOf, window: "3" })).toMatchObject({ from: "2026-01-01", to: asOf });
    expect(readInsights(book.db, { asOf, window: "all" })).toMatchObject({ from: "2025-03-15", spending: 110_000 });
    const custom = readInsights(book.db, { asOf, window: "custom", from: "2025-03-01", to: "2026-12-31" });
    expect(custom).toMatchObject({ from: "2025-03-01", to: asOf, spending: 110_000 });
    const february = readInsights(book.db, { asOf, window: "all", month: "2026-02" });
    expect(february.range).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(february.spending).toBe(40_000);
    expect(() => readInsights(book.db, { asOf, window: "1", month: "2026-02" })).toThrow("period_invalid");
    expect(() => readInsights(book.db, { asOf, window: "custom", from: "2026-04-01", to: "2026-05-01" })).toThrow("period_invalid");
  } finally {
    book.close();
  }
});

test("the savings rate is for the breakdown range, and it is null when income is 0", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing", "2026-01-01");
    const groceries = createCategory(book.db, { name: "Groceries", kind: "expense", ...saved });
    const pay = createCategory(book.db, { name: "Pay", kind: "income", ...saved });
    spend(book.db, { accountId: chequing.id, date: "2026-02-05", amount: 100_000, categoryId: pay.id });
    spend(book.db, { accountId: chequing.id, date: "2026-02-10", amount: -25_000, categoryId: groceries.id });
    spend(book.db, { accountId: chequing.id, date: "2026-03-10", amount: -15_000, categoryId: groceries.id });

    const asOf = "2026-03-16";
    expect(readInsights(book.db, { asOf, window: "6" })).toMatchObject({ income: 100_000, spending: 40_000, savingsRateMilliPct: 60_000 });
    expect(readInsights(book.db, { asOf, window: "6", month: "2026-02" }).savingsRateMilliPct).toBe(75_000);
    expect(readInsights(book.db, { asOf, window: "6", month: "2026-03" })).toMatchObject({ income: 0, savingsRateMilliPct: null });
  } finally {
    book.close();
  }
});

test("a tag limits the report to its spending lines: two tags count in full for each, refunds reduce, transfers and income do not count", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing", "2026-01-01");
    const savings = account(book.db, "Savings", "savings", "2026-01-01");
    const travel = createCategoryGroup(book.db, { name: "Travel", ...saved });
    const hotels = createCategory(book.db, { name: "Hotels", kind: "expense", groupId: travel.id, ...saved });
    const dining = createCategory(book.db, { name: "Dining", kind: "expense", ...saved });
    const pay = createCategory(book.db, { name: "Pay", kind: "income", ...saved });
    const trip = createTag(book.db, { name: "Trip", ...saved });
    const work = createTag(book.db, { name: "Work", ...saved });
    spend(book.db, { accountId: chequing.id, date: "2026-06-02", amount: -100_000, categoryId: hotels.id, tagIds: [trip.id] });
    spend(book.db, { accountId: chequing.id, date: "2026-06-03", amount: -40_000, categoryId: dining.id, tagIds: [trip.id, work.id] });
    spend(book.db, { accountId: chequing.id, date: "2026-06-04", amount: 15_000, categoryId: hotels.id, tagIds: [trip.id] });
    spend(book.db, { accountId: chequing.id, date: "2026-06-05", amount: -70_000, categoryId: dining.id });
    spend(book.db, { accountId: chequing.id, date: "2026-06-06", amount: -50_000, transferAccountId: savings.id, tagIds: [trip.id] });
    spend(book.db, { accountId: chequing.id, date: "2026-06-07", amount: 300_000, categoryId: pay.id, tagIds: [trip.id] });
    const query = { asOf: "2026-06-30", window: "1" } as const;
    const all = readInsights(book.db, query);
    expect(all).toMatchObject({ tagId: null, spending: 195_000, income: 300_000 });

    const onTrip = readInsights(book.db, { ...query, tagId: trip.id });
    expect(onTrip).toMatchObject({ tagId: trip.id, spending: 125_000, income: null, savings: null, savingsRateMilliPct: null });
    expect(onTrip.groups.map((row) => [row.id, row.amount])).toEqual([
      [travel.id, 85_000],
      [null, 40_000],
    ]);
    expect(onTrip.timeline.months).toEqual([{ month: "2026-06", actual: { income: 0, spending: 125_000 }, forecast: null }]);
    expect(onTrip.timeline.forecastEnd).toBeNull();

    const atWork = readInsights(book.db, { ...query, tagId: work.id });
    expect(atWork.spending).toBe(40_000);
    expect(atWork.groups).toEqual([{ id: null, kind: "none", color: null, amount: 40_000, inflow: null, categories: [{ id: dining.id, kind: "item", amount: 40_000, inflow: null }] }]);

    const tripDining = readInsights(book.db, { ...query, tagId: trip.id, category: dining.id });
    expect(tripDining.timeline).toMatchObject({ categoryId: dining.id, forecastEnd: null });
    expect(tripDining.timeline.months[0]?.actual).toEqual({ income: 0, spending: 40_000 });
    expect(() => readInsights(book.db, { ...query, tagId: crypto.randomUUID() })).toThrow("tag_not_found");
  } finally {
    book.close();
  }
});
