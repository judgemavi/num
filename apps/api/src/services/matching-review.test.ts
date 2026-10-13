import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings, transactions } from "@num/db";
import { columnMapSchema, mortgageSplitForDate, type ColumnMap } from "@num/shared";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { undoImportBatch } from "./import-undo";
import { importStatement } from "./imports";
import { loadMatchBook, scorePayee } from "./match-book";
import { saveMortgageTerms } from "./mortgage";
import { createPlan } from "./recurring-plans";
import { createTransaction, getTransaction } from "./transactions";

const at = "2026-10-08T16:00:00.000Z";
const saved = { source: "ui" as const, at };
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
  const dir = mkdtempSync(join(tmpdir(), "num-match-review-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "USD" }).run();
  const account = createAccount(db, {
    name: "Everyday",
    institution: null,
    kind: "chequing",
    openingDate: "2026-01-01",
    openingBalance: 0,
    ...saved,
  });
  return {
    dir,
    db,
    account,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function importCsv(db: Db, dir: string, accountId: string, filename: string, lines: string[], asOf: string) {
  return importStatement(db, dir, {
    source: "import",
    at,
    asOf,
    accountId,
    filename,
    mimeType: "text/csv",
    bytes: new TextEncoder().encode(["date,description,amount", ...lines].join("\n")),
    columnMap: map,
  });
}

function active(db: Db) {
  return db.select().from(transactions).all();
}

test("undo removes the mortgage mirror created for an imported payment", () => {
  const sample = book();
  try {
    const interest = createCategory(sample.db, { name: "Interest", kind: "expense", ...saved });
    const mortgage = createAccount(sample.db, {
      name: "Home loan",
      institution: null,
      kind: "mortgage",
      openingDate: "2026-01-01",
      openingBalance: -10_000_000,
      ...saved,
    });
    saveMortgageTerms(sample.db, mortgage.id, {
      principal: 10_000_000,
      principalAsOf: "2026-03-01",
      rateMilliPct: 5000,
      compounding: "semiannual",
      paymentAmount: 58160,
      paymentFrequency: "monthly",
      firstPaymentDate: "2026-03-01",
      termEnd: "2031-03-01",
      amortizationMonthsRemaining: 300,
      paymentAccountId: sample.account.id,
      interestCategoryId: interest.id,
      propertyAccountId: null,
      ...saved,
    });
    createPlan(sample.db, {
      name: "Mortgage",
      kind: "transfer",
      accountId: sample.account.id,
      expectedAmount: -58160,
      tolerance: 0,
      amountMode: "fixed",
      categoryId: null,
      transferAccountId: mortgage.id,
      merchantId: null,
      startDate: "2026-03-01",
      freq: "monthly",
      interval: 1,
      monthDay: 1,
      businessDayShift: "none",
      endDate: null,
      active: true,
      fundsBuckets: false,
      ...saved,
    });
    const imported = importCsv(sample.db, sample.dir, sample.account.id, "loan.csv", ["03/01/2026,MORTGAGE,-581.60"], "2026-03-05");
    expect(imported.kind).toBe("batch");
    if (imported.kind !== "batch") {
      return;
    }
    const payment = active(sample.db).find((row) => row.accountId === sample.account.id);
    const mirror = active(sample.db).find((row) => row.mirror);
    expect(payment?.transferPeerId).toBe(mirror?.id);
    expect(mirror?.accountId).toBe(mortgage.id);
    undoImportBatch(sample.db, imported.id, saved);
    expect(active(sample.db).some((row) => row.id === payment?.id)).toBe(false);
    expect(active(sample.db).some((row) => row.id === mirror?.id)).toBe(false);
  } finally {
    sample.close();
  }
});

test("a mortgage import links an existing opposite row", () => {
  const sample = book();
  try {
    const interest = createCategory(sample.db, { name: "Interest", kind: "expense", ...saved });
    const mortgage = createAccount(sample.db, {
      name: "Home loan",
      institution: null,
      kind: "mortgage",
      openingDate: "2026-01-01",
      openingBalance: -10_000_000,
      ...saved,
    });
    const terms = {
      accountId: mortgage.id,
      principal: 10_000_000,
      principalAsOf: "2026-03-01",
      rateMilliPct: 5000,
      compounding: "semiannual" as const,
      paymentAmount: 58160,
      paymentFrequency: "monthly" as const,
      firstPaymentDate: "2026-03-01",
      termEnd: "2031-03-01",
      amortizationMonthsRemaining: 300,
      paymentAccountId: sample.account.id,
      interestCategoryId: interest.id,
      propertyAccountId: null,
    };
    const split = mortgageSplitForDate({
      terms,
      valuations: [],
      date: "2026-03-01",
      fromAccountId: sample.account.id,
      toAccountId: mortgage.id,
    });
    if (!split) {
      throw new Error("Schedule row is missing");
    }
    saveMortgageTerms(sample.db, mortgage.id, { ...terms, ...saved });
    const existing = createTransaction(sample.db, {
      accountId: mortgage.id,
      date: "2026-03-01",
      amount: split.principal,
      payeeRaw: "PRINCIPAL",
      status: "open",
      lines: [{ amount: split.principal }],
      ...saved,
    });
    createPlan(sample.db, {
      name: "Mortgage",
      kind: "transfer",
      accountId: sample.account.id,
      expectedAmount: -58160,
      tolerance: 0,
      amountMode: "fixed",
      categoryId: null,
      transferAccountId: mortgage.id,
      merchantId: null,
      startDate: "2026-03-01",
      freq: "monthly",
      interval: 1,
      monthDay: 1,
      businessDayShift: "none",
      endDate: null,
      active: true,
      fundsBuckets: false,
      ...saved,
    });
    importCsv(sample.db, sample.dir, sample.account.id, "loan.csv", ["03/01/2026,MORTGAGE,-581.60"], "2026-03-05");
    const payment = active(sample.db).find((row) => row.accountId === sample.account.id);
    expect(payment?.transferPeerId).toBe(existing.id);
    expect(getTransaction(sample.db, existing.id)?.mirror).toBe(false);
    expect(active(sample.db).some((row) => row.mirror)).toBe(false);
  } finally {
    sample.close();
  }
});

test("a recurring link labels even when payee history disagrees", () => {
  const sample = book();
  try {
    const food = createCategory(sample.db, { name: "Groceries", kind: "expense", ...saved });
    const rent = createCategory(sample.db, { name: "Rent", kind: "expense", ...saved });
    for (const date of ["2026-01-12", "2026-02-12", "2026-03-01"]) {
      createTransaction(sample.db, {
        accountId: sample.account.id,
        date,
        amount: -400,
        payeeRaw: "NORTH CAFE",
        status: "open",
        lines: [{ amount: -400, categoryId: food.id }],
        ...saved,
      });
    }
    createPlan(sample.db, {
      name: "Rent",
      kind: "bill",
      accountId: sample.account.id,
      expectedAmount: -400,
      tolerance: 0,
      amountMode: "fixed",
      categoryId: rent.id,
      transferAccountId: null,
      merchantId: null,
      startDate: "2026-03-12",
      freq: "monthly",
      interval: 1,
      monthDay: 12,
      businessDayShift: "none",
      endDate: null,
      active: true,
      fundsBuckets: false,
      ...saved,
    });
    importCsv(sample.db, sample.dir, sample.account.id, "rent.csv", ["03/12/2026,NORTH CAFE,-4.00"], "2026-03-20");
    const labeled = active(sample.db).find((row) => row.date === "2026-03-12");
    expect(labeled?.autoReason).toBe("recurring");
    expect(getTransaction(sample.db, labeled?.id ?? "")?.lines[0]?.categoryId).toBe(rent.id);
  } finally {
    sample.close();
  }
});

test("a spread label does not block import undo", () => {
  const sample = book();
  try {
    const food = createCategory(sample.db, { name: "Groceries", kind: "expense", ...saved });
    const imported = importCsv(sample.db, sample.dir, sample.account.id, "cafe.csv", ["03/02/2026,NORTH CAFE,-4.00"], "2026-03-20");
    expect(imported.kind).toBe("batch");
    if (imported.kind !== "batch") {
      return;
    }
    createTransaction(sample.db, {
      accountId: sample.account.id,
      date: "2026-03-01",
      amount: -400,
      payeeRaw: "NORTH CAFE",
      status: "open",
      lines: [{ amount: -400, categoryId: food.id }],
      ...saved,
    });
    const labeled = active(sample.db).find((row) => row.date === "2026-03-02");
    expect(labeled?.autoReason).toBe("learned_amount");
    undoImportBatch(sample.db, imported.id, saved);
    expect(active(sample.db).some((row) => row.id === labeled?.id)).toBe(false);
  } finally {
    sample.close();
  }
});

test("a learned transfer preselects Transfer and is not automatic", () => {
  const sample = book();
  try {
    const visa = createAccount(sample.db, {
      name: "Visa",
      institution: null,
      kind: "savings",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    createTransaction(sample.db, {
      accountId: sample.account.id,
      date: "2026-03-01",
      amount: -800,
      payeeRaw: "VISA PAYMENT",
      status: "open",
      lines: [{ amount: -800, transferAccountId: visa.id }],
      ...saved,
    });
    const open = createTransaction(sample.db, {
      accountId: sample.account.id,
      date: "2026-03-02",
      amount: -800,
      payeeRaw: "VISA PAYMENT",
      status: "open",
      lines: [{ amount: -800 }],
      ...saved,
    });
    const result = scorePayee(loadMatchBook(sample.db), { payee: "VISA PAYMENT", amount: -800, recurring: null });
    expect(result.level).toBe("suggestion");
    expect(result.transferAccountId).toBe(visa.id);
    expect(result.categoryId).toBeNull();
    expect(getTransaction(sample.db, open.id)?.autoReason).toBeNull();
    expect(sample.db.select().from(transactions).where(eq(transactions.id, open.id)).get()?.transferPeerId).toBeNull();
  } finally {
    sample.close();
  }
});

test("a payee with a city word is the same payee, and a sub-brand is a similar suggestion", () => {
  const sample = book();
  try {
    const food = createCategory(sample.db, { name: "Groceries", kind: "expense", ...saved });
    const fares = createCategory(sample.db, { name: "Transit", kind: "expense", ...saved });
    const add = (payeeRaw: string, categoryId: string | null, date: string) =>
      createTransaction(sample.db, {
        accountId: sample.account.id,
        date,
        amount: -400,
        payeeRaw,
        status: "open",
        lines: [categoryId ? { amount: -400, categoryId } : { amount: -400 }],
        ...saved,
      });
    for (const name of ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO"]) {
      add(`${name} TORONTO`, null, "2026-01-01");
    }
    for (const date of ["2026-01-12", "2026-02-12", "2026-03-01"]) {
      add("COSTCO WHOLESALE", food.id, date);
      add("PRESTO", fares.id, date);
    }
    const loaded = loadMatchBook(sample.db);
    const same = scorePayee(loaded, { payee: "COSTCO WHOLESALE TORONTO", amount: -400, recurring: null });
    expect(same.categoryId).toBe(food.id);
    expect(same.level).toBe("automatic");
    const similar = scorePayee(loaded, { payee: "PRESTO FARE", amount: -400, recurring: null });
    expect(similar.categoryId).toBe(fares.id);
    expect(similar.reason).toBe("similar");
    expect(similar.sourceName).toBe("PRESTO");
    expect(similar.level).toBe("suggestion");
  } finally {
    sample.close();
  }
});
