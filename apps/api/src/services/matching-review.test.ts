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
import { createSchedule } from "./schedule-test-book";
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
    asOf: "2026-10-07",
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

function importCsv(db: Db, accountId: string, filename: string, lines: string[], asOf: string) {
  return importStatement(db, {
    source: "import",
    at,
    asOf,
    accountId,
    filename,
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
      asOf: "2026-10-07",
      name: "Home loan",
      institution: null,
      kind: "mortgage",
      openingDate: "2026-02-01",
      openingBalance: -100_000_000,
      mortgageTerms: {
        rateMilliPct: 5000,
        compounding: "semiannual",
        paymentAmount: 581600,
        paymentFrequency: "monthly",
        firstPaymentDate: "2026-03-01",
        termEnd: "2031-03-01",
        amortizationMonthsRemaining: 300,
        paymentAccountId: sample.account.id,
        interestCategoryId: interest.id,
        propertyAccountId: null,
      },
      ...saved,
    });
    createSchedule(sample.db, {
      name: "Mortgage",
      kind: "commitment",
      accountId: sample.account.id,
      expectedAmount: -581600,
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
      ...saved,
    });
    const imported = importCsv(sample.db, sample.account.id, "loan.csv", ["03/01/2026,MORTGAGE,-581.60"], "2026-03-05");
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
    const terms = {
      rateMilliPct: 5000,
      compounding: "semiannual" as const,
      paymentAmount: 581600,
      paymentFrequency: "monthly" as const,
      firstPaymentDate: "2026-03-01",
      termEnd: "2031-03-01",
      amortizationMonthsRemaining: 300,
      paymentAccountId: sample.account.id,
      interestCategoryId: interest.id,
      propertyAccountId: null,
    };
    const mortgage = createAccount(sample.db, {
      asOf: "2026-10-07",
      name: "Home loan",
      institution: null,
      kind: "mortgage",
      openingDate: "2026-02-01",
      openingBalance: -100_000_000,
      mortgageTerms: terms,
      ...saved,
    });
    const split = mortgageSplitForDate({
      terms: { ...terms, accountId: mortgage.id },
      opening: { balance: mortgage.openingBalance, date: "2026-02-01" },
      valuations: [],
      date: "2026-03-01",
      fromAccountId: sample.account.id,
      toAccountId: mortgage.id, step: 10,
    });
    if (!split) {
      throw new Error("Schedule row is missing");
    }
    const existing = createTransaction(sample.db, {
      accountId: mortgage.id,
      date: "2026-03-01",
      amount: split.principal,
      payeeRaw: "PRINCIPAL",
      lines: [{ amount: split.principal }],
      ...saved,
    });
    createSchedule(sample.db, {
      name: "Mortgage",
      kind: "commitment",
      accountId: sample.account.id,
      expectedAmount: -581600,
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
      ...saved,
    });
    importCsv(sample.db, sample.account.id, "loan.csv", ["03/01/2026,MORTGAGE,-581.60"], "2026-03-05");
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
        amount: -4000,
        payeeRaw: "NORTH CAFE",
        lines: [{ amount: -4000, categoryId: food.id }],
        ...saved,
      });
    }
    createSchedule(sample.db, {
      name: "Rent",
      kind: "commitment",
      accountId: sample.account.id,
      expectedAmount: -4000,
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
      ...saved,
    });
    importCsv(sample.db, sample.account.id, "rent.csv", ["03/12/2026,NORTH CAFE,-4.00"], "2026-03-20");
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
    const imported = importCsv(sample.db, sample.account.id, "cafe.csv", ["03/02/2026,NORTH CAFE,-4.00"], "2026-03-20");
    expect(imported.kind).toBe("batch");
    if (imported.kind !== "batch") {
      return;
    }
    createTransaction(sample.db, {
      accountId: sample.account.id,
      date: "2026-03-01",
      amount: -4000,
      payeeRaw: "NORTH CAFE",
      lines: [{ amount: -4000, categoryId: food.id }],
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
      asOf: "2026-10-07",
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
      amount: -8000,
      payeeRaw: "VISA PAYMENT",
      lines: [{ amount: -8000, transferAccountId: visa.id }],
      ...saved,
    });
    const open = createTransaction(sample.db, {
      accountId: sample.account.id,
      date: "2026-03-02",
      amount: -8000,
      payeeRaw: "VISA PAYMENT",
      lines: [{ amount: -8000 }],
      ...saved,
    });
    const result = scorePayee(loadMatchBook(sample.db), { payee: "VISA PAYMENT", amount: -8000, recurring: null });
    expect(result.level).toBe("suggestion");
    expect(result.transferAccountId).toBe(visa.id);
    expect(result.categoryId).toBeNull();
    expect(getTransaction(sample.db, open.id)?.autoReason).toBeNull();
    expect(sample.db.select().from(transactions).where(eq(transactions.id, open.id)).get()?.transferPeerId).toBeNull();
  } finally {
    sample.close();
  }
});

function learn(sample: ReturnType<typeof book>, payeeRaw: string, categoryId: string) {
  createTransaction(sample.db, {
    accountId: sample.account.id,
    date: "2026-01-12",
    amount: -4000,
    payeeRaw,
    lines: [{ amount: -4000, categoryId }],
    ...saved,
  });
}

test("a brand family suggests when 2 learned payees agree, and stops when they disagree", () => {
  const sample = book();
  try {
    const transit = createCategory(sample.db, { name: "Transit", kind: "expense", ...saved });
    const food = createCategory(sample.db, { name: "Groceries", kind: "expense", ...saved });
    const fuel = createCategory(sample.db, { name: "Fuel", kind: "expense", ...saved });
    learn(sample, "DEMOFARE NORTH STN", transit.id);
    learn(sample, "EXAMPLEMART WHOLESALE", food.id);
    learn(sample, "EXAMPLEMART GAS", fuel.id);
    const one = scorePayee(loadMatchBook(sample.db), { payee: "EXAMPLEMART BUSINESS CENTRE", amount: -4000, recurring: null });
    expect(one.level).toBe("none");
    expect(scorePayee(loadMatchBook(sample.db), { payee: "DEMOFARE EAST STN", amount: -4000, recurring: null }).level).toBe("none");
    learn(sample, "DEMOFARE WEST STN", transit.id);
    const loaded = loadMatchBook(sample.db);
    const family = scorePayee(loaded, { payee: "DEMOFARE EAST STN", amount: -4000, recurring: null });
    expect(family.categoryId).toBe(transit.id);
    expect(family.reason).toBe("family");
    expect(family.level).toBe("suggestion");
    expect(scorePayee(loaded, { payee: "EXAMPLEMART BUSINESS CENTRE", amount: -4000, recurring: null }).level).toBe("none");
    learn(sample, "DEMOFARE LOAD", fuel.id);
    expect(scorePayee(loadMatchBook(sample.db), { payee: "DEMOFARE EAST STN", amount: -4000, recurring: null }).level).toBe("none");
  } finally {
    sample.close();
  }
});

test("containment wins over the brand family", () => {
  const sample = book();
  try {
    const transit = createCategory(sample.db, { name: "Transit", kind: "expense", ...saved });
    const fuel = createCategory(sample.db, { name: "Fuel", kind: "expense", ...saved });
    learn(sample, "DEMOFARE NORTH STN", transit.id);
    learn(sample, "DEMOFARE WEST STN", transit.id);
    learn(sample, "DEMOFARE LOAD", fuel.id);
    const result = scorePayee(loadMatchBook(sample.db), { payee: "DEMOFARE LOAD EXAMPLEVILLE", amount: -4000, recurring: null });
    expect(result.reason).toBe("similar");
    expect(result.categoryId).toBe(fuel.id);
  } finally {
    sample.close();
  }
});

test("a payee that contains a learned payee is a similar suggestion and never automatic", () => {
  const sample = book();
  try {
    const food = createCategory(sample.db, { name: "Groceries", kind: "expense", ...saved });
    for (const date of ["2026-01-12", "2026-02-12", "2026-03-01"]) {
      createTransaction(sample.db, {
        accountId: sample.account.id,
        date,
        amount: -4000,
        payeeRaw: "EXAMPLEMART WHOLESALE",
        lines: [{ amount: -4000, categoryId: food.id }],
        ...saved,
      });
    }
    const loaded = loadMatchBook(sample.db);
    const similar = scorePayee(loaded, { payee: "EXAMPLEMART WHOLESALE W909 EXAMPLEVILLE", amount: -4000, recurring: null });
    expect(similar.categoryId).toBe(food.id);
    expect(similar.reason).toBe("similar");
    expect(similar.level).toBe("suggestion");
    expect(scorePayee(loaded, { payee: "EXAMPLEMART", amount: -4000, recurring: null }).level).toBe("none");
  } finally {
    sample.close();
  }
});
