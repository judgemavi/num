import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { categories, migrateDatabase, openDatabase, transactionLines, transactions, valuations } from "@num/db";
import { mortgageBalanceAsOf, type TransactionCreate } from "@num/shared";
import { eq, isNull } from "drizzle-orm";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createCategory, createCategoryGroup } from "./categories";
import { readInsights } from "./insights";
import { createMerchant } from "./merchants";
import { saveMortgageTerms } from "./mortgage";
import { createTag } from "./tags";
import { createTransaction } from "./transactions";

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-insights-"));
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

const saved = { source: "ui" as const, at: "2026-06-30T16:00:00Z" };

function account(db: Db, name: string, kind: "chequing" | "savings" | "property" | "mortgage", openingDate: string, openingBalance = 0) {
  return createAccount(db, { name, kind, openingDate, openingBalance, ...saved });
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
    status: "open",
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
    .where(isNull(transactions.deletedAt))
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

test("refunds reduce spending, transfers are excluded, and uncategorized is its own row", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing", "2026-01-01");
    const savings = account(book.db, "Savings", "savings", "2026-01-01");
    const home = createCategoryGroup(book.db, { name: "Home", ...saved });
    const groceries = createCategory(book.db, { name: "Groceries", kind: "expense", groupId: home.id, ...saved });
    const fun = createCategory(book.db, { name: "Fun", kind: "expense", ...saved });
    const pay = createCategory(book.db, { name: "Pay", kind: "income", ...saved });
    const shop = createMerchant(book.db, { name: "Shop", ...saved });
    const trip = createTag(book.db, { name: "Trip", ...saved });
    const gift = createTag(book.db, { name: "Gift", ...saved });
    spend(book.db, { accountId: chequing.id, date: "2026-06-02", amount: -10_000, categoryId: groceries.id, merchantId: shop.id });
    spend(book.db, { accountId: chequing.id, date: "2026-06-03", amount: 2_500, categoryId: groceries.id, merchantId: shop.id });
    spend(book.db, { accountId: chequing.id, date: "2026-06-04", amount: 40_000, categoryId: pay.id });
    spend(book.db, { accountId: chequing.id, date: "2026-06-05", amount: -8_000, transferAccountId: savings.id });
    spend(book.db, { accountId: chequing.id, date: "2026-06-06", amount: -3_000 });
    spend(book.db, {
      accountId: chequing.id,
      date: "2026-06-07",
      amount: -2_000,
      categoryId: fun.id,
      tagIds: [trip.id, gift.id],
    });

    const sums = rawClassified(book.db);
    const query = { asOf: "2026-06-30", from: "2026-06-01", to: "2026-06-30" } as const;
    const byCategory = readInsights(book.db, { ...query, by: "category" });
    expect(byCategory.spending).toBe(sums.spending);
    expect(byCategory.income).toBe(sums.income);
    expect(byCategory.spending).toBe(9_500);
    expect(byCategory.spending).not.toBe(sums.raw);
    expect(byCategory.income).not.toBe(sums.raw);
    expect(byCategory.rows.find((row) => row.id === pay.id)).toBeUndefined();
    expect(byCategory.rows).toContainEqual({ id: groceries.id, kind: "item", amount: 7_500 });
    expect(byCategory.rows).toContainEqual({ id: fun.id, kind: "item", amount: 2_000 });
    expect(byCategory.rows).toContainEqual({ id: null, kind: "uncategorized", amount: sums.uncategorized });
    expect(sums.uncategorized).toBe(-3_000);

    const byGroup = readInsights(book.db, { ...query, by: "group" });
    expect(byGroup.spending).toBe(sums.spending);
    expect(byGroup.rows).toContainEqual({ id: home.id, kind: "item", amount: 7_500 });
    expect(byGroup.rows).toContainEqual({ id: null, kind: "none", amount: 2_000 });
    expect(byGroup.rows).toContainEqual({ id: null, kind: "uncategorized", amount: -3_000 });

    const byMerchant = readInsights(book.db, { ...query, by: "merchant" });
    expect(byMerchant.rows).toContainEqual({ id: shop.id, kind: "item", amount: 7_500 });
    expect(byMerchant.rows).toContainEqual({ id: null, kind: "none", amount: 2_000 });
    expect(byMerchant.rows).toContainEqual({ id: null, kind: "uncategorized", amount: -3_000 });

    const byTag = readInsights(book.db, { ...query, by: "tag" });
    expect(byTag.spending).toBe(9_500);
    expect(byTag.rows).toContainEqual({ id: trip.id, kind: "item", amount: 2_000 });
    expect(byTag.rows).toContainEqual({ id: gift.id, kind: "item", amount: 2_000 });
    expect(byTag.rows).toContainEqual({ id: null, kind: "none", amount: 7_500 });
    const tagged = byTag.rows.filter((row) => row.kind !== "uncategorized").reduce((sum, row) => sum + row.amount, 0);
    expect(tagged).not.toBe(byTag.spending);
  } finally {
    book.close();
  }
});

test("the trend is twelve months through asOf and leaves out later days", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing", "2025-01-01");
    const groceries = createCategory(book.db, { name: "Groceries", kind: "expense", ...saved });
    const pay = createCategory(book.db, { name: "Pay", kind: "income", ...saved });
    spend(book.db, { accountId: chequing.id, date: "2025-03-15", amount: -7_000, categoryId: groceries.id });
    spend(book.db, { accountId: chequing.id, date: "2026-01-20", amount: -4_000, categoryId: groceries.id });
    spend(book.db, { accountId: chequing.id, date: "2026-02-02", amount: 6_000, categoryId: pay.id });
    spend(book.db, { accountId: chequing.id, date: "2026-03-10", amount: -1_500, categoryId: groceries.id });
    spend(book.db, { accountId: chequing.id, date: "2026-03-20", amount: -9_000, categoryId: groceries.id });

    const report = readInsights(book.db, { asOf: "2026-03-16", categoryId: groceries.id });
    expect(report.trend).toHaveLength(12);
    expect(report.trend[0]?.month).toBe("2025-04");
    expect(report.trend[11]?.month).toBe("2026-03");
    expect(report.trend.find((point) => point.month === "2026-01")).toMatchObject({ spending: 4_000, income: 0 });
    expect(report.trend.find((point) => point.month === "2026-02")).toMatchObject({ spending: 0, income: 6_000 });
    expect(report.trend.find((point) => point.month === "2026-03")).toMatchObject({ spending: 1_500, income: 0 });
    expect(report.trend.filter((point) => point.month < "2026-01").every((point) => point.spending === 0 && point.income === 0)).toBe(true);
    expect(report.categoryTrend?.find((point) => point.month === "2026-01")?.spending).toBe(4_000);
    expect(report.categoryTrend?.find((point) => point.month === "2026-03")?.spending).toBe(1_500);
    expect(report.categoryTrend?.find((point) => point.month === "2026-02")?.spending).toBe(0);
  } finally {
    book.close();
  }
});

test("net worth at month end uses a property valuation and the mortgage schedule", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing", "2024-06-01", 100_000);
    const property = account(book.db, "House", "property", "2025-01-01");
    const mortgage = account(book.db, "Home loan", "mortgage", "2025-01-01");
    const interest = createCategory(book.db, { name: "Interest", kind: "expense", ...saved });
    const terms = saveMortgageTerms(book.db, mortgage.id, {
      principal: 1_000_000,
      principalAsOf: "2025-01-01",
      rateMilliPct: 0,
      compounding: "monthly",
      paymentAmount: 100_000,
      paymentFrequency: "monthly",
      firstPaymentDate: "2025-02-01",
      termEnd: "2026-01-01",
      amortizationMonthsRemaining: 10,
      paymentAccountId: chequing.id,
      interestCategoryId: interest.id,
      propertyAccountId: property.id,
      ...saved,
    });
    const marks = [{ date: "2025-03-31", balance: -500_000 }];
    book.db.insert(valuations).values({ id: crypto.randomUUID(), accountId: property.id, date: "2025-03-15", balance: 2_000_000 }).run();
    book.db.insert(valuations).values({ id: crypto.randomUUID(), accountId: mortgage.id, date: "2025-03-31", balance: -500_000 }).run();
    spend(book.db, { accountId: property.id, date: "2025-03-20", amount: 50_000 });

    const report = readInsights(book.db, { asOf: "2025-03-31" });
    expect(report.netWorth).toHaveLength(24);
    const may = report.netWorth.find((point) => point.month === "2024-05");
    const june = report.netWorth.find((point) => point.month === "2024-06");
    const january = report.netWorth.find((point) => point.month === "2025-01");
    const february = report.netWorth.find((point) => point.month === "2025-02");
    const march = report.netWorth.find((point) => point.month === "2025-03");
    expect(may).toMatchObject({ date: "2024-05-31", assets: 0, liabilities: 0, net: 0 });
    expect(june).toMatchObject({ date: "2024-06-30", assets: 100_000, liabilities: 0, net: 100_000 });
    expect(january).toMatchObject({ date: "2025-01-31", liabilities: 1_000_000, net: 100_000 - 1_000_000 });
    expect(mortgageBalanceAsOf(terms, marks, "2025-02-28")).toBe(900_000);
    expect(february).toMatchObject({ date: "2025-02-28", liabilities: 900_000, assets: 100_000, net: 100_000 - 900_000 });
    expect(mortgageBalanceAsOf(terms, marks, "2025-03-31")).toBe(500_000);
    expect(march).toMatchObject({
      date: "2025-03-31",
      assets: 2_150_000,
      liabilities: 500_000,
      net: 1_650_000,
    });
  } finally {
    book.close();
  }
});
