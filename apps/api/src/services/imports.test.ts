import { readFileSync } from "node:fs";
import { join } from "node:path";
import { accounts, auditLog, transactions, importBatches, occurrenceLinks } from "@num/db";
import { columnMapSchema } from "@num/shared";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createCategory } from "./categories";
import { createSchedule } from "./schedule-test-book";
import { createTransaction } from "./transactions";
import { createAccount } from "./accounts";
import { importStatement, listImportBatches } from "./imports";
import { presetsDirectory } from "./presets";
import { at, map, tempBook, csv, importCsv, activeCount } from "./import-test-book";

test("the same file two times creates no new transactions", () => {
  const book = tempBook();
  try {
    const lines = ["01/02/2026,NORTH MARKET,-12.50", "01/03/2026,PAY DEPOSIT,20.00"];
    const bytes = csv(lines);
    const first = importStatement(book.db, {
      asOf: "2026-10-07",
      source: "import",
      at,
      accountId: book.account.id,
      filename: "january.csv",
      bytes,
      columnMap: map,
    });
    const second = importStatement(book.db, {
      asOf: "2026-10-07",
      source: "import",
      at,
      accountId: book.account.id,
      filename: "january-copy.csv",
      bytes,
      columnMap: map,
    });
    expect(first.kind).toBe("batch");
    expect(second.kind).toBe("batch");
    if (second.kind !== "batch" || first.kind !== "batch") {
      return;
    }
    expect(second.alreadyImported).toBe(true);
    expect(second.counts.created).toBe(first.counts.created);
    expect(activeCount(book.db)).toBe(2);
    expect(book.db.select().from(auditLog).where(eq(auditLog.entity, "import_batches")).all()).toHaveLength(1);
  } finally {
    book.close();
  }
});

test("overlapping files do not create a duplicate transaction", () => {
  const book = tempBook();
  try {
    importCsv(book.db, book.account.id, "week-a.csv", [
      "01/05/2026,NORTH MARKET,-10.00",
      "01/06/2026,PAY DEPOSIT,20.00",
    ]);
    const second = importCsv(book.db, book.account.id, "week-b.csv", [
      "01/05/2026,north   market,-10.00",
      "01/07/2026,CITY TRANSIT,-3.25",
    ]);
    expect(second.kind).toBe("batch");
    if (second.kind !== "batch") {
      return;
    }
    expect(second.counts.duplicate).toBe(1);
    expect(second.counts.created).toBe(1);
    expect(activeCount(book.db)).toBe(3);
    const shared = book.db
      .select()
      .from(transactions)
      .where(eq(transactions.date, "2026-01-05"))
      .all();
    expect(shared).toHaveLength(1);
  } finally {
    book.close();
  }
});

test("two identical rows on one day in one file create two transactions", () => {
  const book = tempBook();
  try {
    const result = importCsv(book.db, book.account.id, "twins.csv", [
      "01/02/2026,NORTH MARKET,-12.50",
      "01/02/2026,NORTH MARKET,-12.50",
    ]);
    expect(result.kind).toBe("batch");
    if (result.kind !== "batch") {
      return;
    }
    expect(result.counts.created).toBe(2);
    expect(result.counts.duplicate).toBe(0);
    expect(activeCount(book.db)).toBe(2);
  } finally {
    book.close();
  }
});

test("a column map is saved after the first import", () => {
  const book = tempBook();
  try {
    const withBalance = columnMapSchema.parse({ ...map, balance: 3 });
    const first = importStatement(book.db, {
      asOf: "2026-10-07",
      source: "import",
      at,
      accountId: book.account.id,
      filename: "first.csv",
      bytes: csv(["01/02/2026,NORTH MARKET,-12.50,100.00"], true),
      columnMap: withBalance,
    });
    expect(first.kind).toBe("batch");
    if (first.kind !== "batch") {
      return;
    }
    expect(first.closingBalance).toBe(100000);
    expect(first.closingDate).toBe("2026-01-02");
    const saved = book.db.select().from(accounts).where(eq(accounts.id, book.account.id)).get();
    expect(saved?.columnMap).toEqual(withBalance);

    const second = importStatement(book.db, {
      asOf: "2026-10-07",
      source: "import",
      at,
      accountId: book.account.id,
      filename: "second.csv",
      bytes: csv(["01/04/2026,CITY TRANSIT,-3.25,96.75"], true),
      columnMap: null,
    });
    expect(second.kind).toBe("batch");
    if (second.kind !== "batch") {
      return;
    }
    expect(second.counts.created).toBe(1);
    const again = book.db.select().from(accounts).where(eq(accounts.id, book.account.id)).get();
    expect(again?.columnMap).toEqual(saved?.columnMap);
    expect(listImportBatches(book.db, book.account.id).items).toHaveLength(2);
  } finally {
    book.close();
  }
});

test("a saved preset that no longer exists uses detection", () => {
  const book = tempBook();
  try {
    book.db.update(accounts).set({ importPreset: "td-chequing" }).where(eq(accounts.id, book.account.id)).run();
    const bytes = new TextEncoder().encode(readFileSync(join(presetsDirectory(), "fixtures", "td-chequing.csv"), "utf8"));
    const result = importStatement(book.db, {
      asOf: "2026-10-07",
      source: "import",
      at,
      accountId: book.account.id,
      filename: "accountactivity.csv",
      bytes,
    });
    expect(result.kind).toBe("batch");
    if (result.kind === "batch") {
      expect(result.counts.created).toBe(3);
    }
  } finally {
    book.close();
  }
});

test("the first import with a running balance suggests the opening balance", () => {
  const book = tempBook();
  try {
    const withBalance = columnMapSchema.parse({ ...map, balance: 3 });
    const first = importStatement(book.db, {
      asOf: "2026-10-07",
      source: "import",
      at,
      accountId: book.account.id,
      filename: "january.csv",
      bytes: csv(["01/02/2026,NORTH MARKET,-12.50,1487.50", "01/04/2026,PAY DEPOSIT,200.00,1687.50"], true),
      columnMap: withBalance,
    });
    expect(first.kind).toBe("batch");
    if (first.kind !== "batch") {
      return;
    }
    expect(first.openingSuggestion).toEqual({ amount: 1_500_000, date: "2026-01-01" });

    const card = createAccount(book.db, {
      asOf: "2026-10-07",
      name: "Card",
      institution: null,
      kind: "credit_card",
      openingDate: "2026-01-01",
      openingBalance: 0,
      paymentPolicy: "full",
      source: "ui",
      at,
    });
    const cardMap = columnMapSchema.parse({ ...withBalance, balanceSign: "inverted" });
    const cardImport = importStatement(book.db, {
      asOf: "2026-10-07",
      source: "import",
      at,
      accountId: card.id,
      filename: "card.csv",
      bytes: csv(["01/05/2026,NORTH MARKET,-24.00,80.00"], true),
      columnMap: cardMap,
    });
    expect(cardImport.kind).toBe("batch");
    if (cardImport.kind === "batch") {
      expect(cardImport.openingSuggestion).toEqual({ amount: -56_000, date: "2026-01-04" });
    }

    const second = importStatement(book.db, {
      asOf: "2026-10-07",
      source: "import",
      at,
      accountId: book.account.id,
      filename: "february.csv",
      bytes: csv(["02/02/2026,CITY TRANSIT,-3.25,1684.25"], true),
      columnMap: withBalance,
    });
    expect(second.kind).toBe("batch");
    if (second.kind === "batch") {
      expect(second.openingSuggestion).toBeNull();
    }
  } finally {
    book.close();
  }
});


test("a recurring link failure rolls back the imported batch and its audit entries", () => {
  const book = tempBook();
  const saved = { source: "ui" as const, at };
  try {
    const category = createCategory(book.db, { name: "Rent", kind: "expense", ...saved });
    createSchedule(book.db, {
      name: "Rent", kind: "commitment", accountId: book.account.id, categoryId: category.id,
      expectedAmount: -10_000, tolerance: 0, amountMode: "fixed", startDate: "2026-03-01",
      freq: "monthly", interval: 1, monthDay: 1, businessDayShift: "none", ...saved,
    });
    const payment = createTransaction(book.db, {
      accountId: book.account.id, date: "2026-03-01", amount: -10_000,
      payeeRaw: "Rent", lines: [{ amount: -10_000, categoryId: category.id }], ...saved,
    });
    const auditCount = book.db.select().from(auditLog).all().length;
    book.sqlite.exec("CREATE TRIGGER reject_test_link BEFORE INSERT ON occurrence_links BEGIN SELECT RAISE(ABORT, 'test link failure'); END");
    expect(() => importStatement(book.db, {
      source: "import", at, accountId: book.account.id, asOf: "2026-03-05",
      filename: "rent.csv", bytes: csv(["03/01/2026,Rent,-10.00"]), columnMap: map,
    })).toThrow("test link failure");
    expect(book.db.select().from(importBatches).all()).toHaveLength(0);
    expect(book.db.select().from(occurrenceLinks).all()).toHaveLength(0);
    expect(book.db.select().from(auditLog).all()).toHaveLength(auditCount);
    expect(book.db.select().from(transactions).where(eq(transactions.id, payment.id)).get()?.importRowId).toBeNull();
  } finally {
    book.close();
  }
});
