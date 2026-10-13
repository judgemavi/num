import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  auditLog,
  documents,
  importBatches,
  importRows,
  migrateDatabase,
  openDatabase,
  settings,
  transactionLines,
  transactions,
} from "@num/db";
import { columnMapSchema, normalizePayee, type ColumnMap } from "@num/shared";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { saveImportBatch } from "./import-save";
import { undoImportBatch } from "./import-undo";
import { importStatement, listImportBatches } from "./imports";
import { createMerchant } from "./merchants";
import { createTransaction, deleteTransaction } from "./transactions";

const at = "2026-10-07T16:00:00Z";

const map: ColumnMap = columnMapSchema.parse({
  hasHeader: true,
  date: 0,
  description: 1,
  amount: 2,
  dateOrder: "mdy",
  signConvention: "account",
  decimalSeparator: ".",
});

function tempBook() {
  const dir = mkdtempSync(join(tmpdir(), "num-import-"));
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
    source: "ui",
    at,
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

function csv(lines: string[]): Uint8Array {
  return new TextEncoder().encode(["date,description,amount", ...lines].join("\n") + "\n");
}

function importCsv(db: Db, dir: string, accountId: string, filename: string, lines: string[]) {
  return importStatement(db, dir, {
    source: "import",
    at,
    accountId,
    filename,
    mimeType: "text/csv",
    bytes: csv(lines),
    columnMap: map,
  });
}

function activeCount(db: Db): number {
  return db.select({ id: transactions.id }).from(transactions).all().length;
}

test("the same rows with different bytes create no new transactions", () => {
  const book = tempBook();
  try {
    const text = "date,description,amount\n01/02/2026,NORTH MARKET,-12.50\n";
    importStatement(book.db, book.dir, {
      source: "import",
      at,
      accountId: book.account.id,
      filename: "lf.csv",
      mimeType: "text/csv",
      bytes: new TextEncoder().encode(text),
      columnMap: map,
    });
    const second = importStatement(book.db, book.dir, {
      source: "import",
      at,
      accountId: book.account.id,
      filename: "crlf.csv",
      mimeType: "text/csv",
      bytes: new TextEncoder().encode(text.replaceAll("\n", "\r\n")),
      columnMap: map,
    });
    expect(second.kind).toBe("batch");
    if (second.kind !== "batch") {
      return;
    }
    expect(second.counts.created).toBe(0);
    expect(second.counts.duplicate).toBe(1);
    expect(activeCount(book.db)).toBe(1);
  } finally {
    book.close();
  }
});

test("a bank id uses the bank identity", () => {
  const book = tempBook();
  try {
    const bankMap = columnMapSchema.parse({ ...map, bankId: 3 });
    importStatement(book.db, book.dir, {
      source: "import",
      at,
      accountId: book.account.id,
      filename: "bank.csv",
      mimeType: "text/csv",
      bytes: new TextEncoder().encode("date,description,amount,id\n01/02/2026,NORTH MARKET,-12.50,FIT-1\n"),
      columnMap: bankMap,
    });
    const row = book.db.select().from(importRows).all()[0];
    expect(row?.identity).toBe("bank:FIT-1");
    expect(row?.bankId).toBe("FIT-1");
  } finally {
    book.close();
  }
});

test("undo of every row sets undoneAt and a later file can import the rows again", () => {
  const book = tempBook();
  try {
    const text = "date,description,amount\n01/08/2026,CITY TRANSIT,-3.25\n";
    const first = importStatement(book.db, book.dir, {
      source: "import",
      at,
      accountId: book.account.id,
      filename: "once.csv",
      mimeType: "text/csv",
      bytes: new TextEncoder().encode(text),
      columnMap: map,
    });
    if (first.kind !== "batch") {
      throw new Error("Import did not create a batch");
    }
    const undone = undoImportBatch(book.db, first.id, { source: "import", at: "2026-10-09T16:00:00Z" });
    expect(undone.blocked).toEqual([]);
    expect(undone.batch.undoneAt).toBe("2026-10-09T16:00:00Z");
    const again = importStatement(book.db, book.dir, {
      source: "import",
      at: "2026-10-10T16:00:00Z",
      accountId: book.account.id,
      filename: "again.csv",
      mimeType: "text/csv",
      bytes: new TextEncoder().encode(text),
      columnMap: map,
    });
    expect(again.kind).toBe("batch");
    if (again.kind !== "batch") {
      return;
    }
    expect(again.counts.created).toBe(1);
    expect(activeCount(book.db)).toBe(1);
  } finally {
    book.close();
  }
});

test("a deleted created transaction counts as removed", () => {
  const book = tempBook();
  try {
    const result = importCsv(book.db, book.dir, book.account.id, "gone.csv", ["01/09/2026,KEEP,-1.00"]);
    if (result.kind !== "batch") {
      throw new Error("Import did not create a batch");
    }
    const txn = book.db.select().from(transactions).all()[0];
    if (!txn) {
      throw new Error("Transaction is missing");
    }
    deleteTransaction(book.db, txn.id, { source: "ui", at: "2026-10-08T16:00:00Z" });
    const undone = undoImportBatch(book.db, result.id, { source: "import", at: "2026-10-09T16:00:00Z" });
    expect(undone.blocked).toEqual([]);
    expect(undone.batch.undoneAt).toBe("2026-10-09T16:00:00Z");
    expect(book.db.select().from(importRows).all()[0]?.active).toBe(false);
    expect(book.db.select().from(transactions).all()).toEqual([]);
  } finally {
    book.close();
  }
});

test("a failed import leaves no document, batch, row or file", () => {
  const book = tempBook();
  try {
    const row = {
      date: "2026-01-02",
      amount: -1250,
      payeeRaw: "NORTH MARKET",
      bankId: "SAME",
      rowIndex: 0,
      identity: "bank:SAME",
      outcome: "created" as const,
      transactionId: null,
      suggestion: null,
    };
    expect(() =>
      saveImportBatch(book.db, {
        source: "import",
        at,
        accountId: book.account.id,
        dataDir: book.dir,
        bytes: new TextEncoder().encode("bad"),
        document: {
          id: crypto.randomUUID(),
          filename: "bad.csv",
          hash: "abc123",
          mimeType: "text/csv",
          storagePath: "uploads/abc123",
          uploadedAt: at,
          deletedAt: null,
        },
        newFile: true,
        restoreDocument: false,
        parser: "csv",
        rows: [row, { ...row, rowIndex: 1 }],
        closingBalance: null,
        closingDate: null,
        unreadable: [],
        presetId: null,
        columnMap: null,
        asOf: null,
      }),
    ).toThrow();
    expect(book.db.select().from(documents).all()).toHaveLength(0);
    expect(book.db.select().from(importBatches).all()).toHaveLength(0);
    expect(book.db.select().from(importRows).all()).toHaveLength(0);
    expect(readdirSync(join(book.dir, "uploads"))).toEqual([]);
  } finally {
    book.close();
  }
});

test("a created row stores the normalized payee and the suggestion", () => {
  const book = tempBook();
  try {
    const category = createCategory(book.db, {
      name: "Groceries",
      kind: "expense",
      source: "ui",
      at,
    });
    createMerchant(book.db, {
      name: "NORTH MARKET",
      defaultCategoryId: category.id,
      source: "ui",
      at,
    });
    const result = importCsv(book.db, book.dir, book.account.id, "shop.csv", ["01/02/2026,NORTH MARKET,-12.50"]);
    expect(result.kind).toBe("batch");
    const txn = book.db.select().from(transactions).all()[0];
    expect(txn?.payeeNormalized).toBe(normalizePayee("NORTH MARKET"));
    expect(txn?.merchantId).toBeNull();
    expect(txn?.autoReason).toBeNull();
    expect(txn?.status).toBe("cleared");
    const audits = book.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, txn?.id ?? ""))
      .all();
    expect(audits.map((item) => item.action)).toEqual(["create"]);
    expect(audits[0]?.after).toContain("merchant_default");
    expect(book.db.select().from(transactionLines).all()[0]?.categoryId).toBeNull();
  } finally {
    book.close();
  }
});

test("unreadable rows are stored on the batch and listed", () => {
  const book = tempBook();
  try {
    const result = importCsv(book.db, book.dir, book.account.id, "mixed.csv", [
      "01/02/2026,NORTH MARKET,-12.50",
      "bad,CITY TRANSIT,-1.00",
    ]);
    expect(result.kind).toBe("batch");
    if (result.kind !== "batch") {
      return;
    }
    expect(result.counts.unreadable).toBe(1);
    expect(result.unreadable[0]?.reason).toBe("date_unreadable");
    const listed = listImportBatches(book.db, book.account.id).items[0];
    expect(listed?.counts.unreadable).toBe(1);
    expect(listed?.unreadable).toHaveLength(1);
  } finally {
    book.close();
  }
});

test("an imported row is cleared, a match sets cleared, and undo restores the earlier status", () => {
  const book = tempBook();
  try {
    createTransaction(book.db, {
      accountId: book.account.id,
      date: "2026-04-01",
      amount: -1000,
      payeeRaw: "RENT",
      status: "open",
      lines: [{ amount: -1000 }],
      source: "ui",
      at,
    });
    const result = importCsv(book.db, book.dir, book.account.id, "mix.csv", [
      "04/02/2026,RENT PAYMENT,-10.00",
      "01/09/2026,NEW SHOP,-2.00",
    ]);
    if (result.kind !== "batch") {
      throw new Error("Import did not create a batch");
    }
    expect(result.counts.matched).toBe(1);
    expect(result.counts.created).toBe(1);
    const all = book.db.select().from(transactions).all();
    expect(all.map((txn) => txn.status)).toEqual(["cleared", "cleared"]);
    undoImportBatch(book.db, result.id, { source: "import", at: "2026-10-09T16:00:00Z" });
    const after = book.db.select().from(transactions).all();
    expect(after.length).toBe(1);
    expect(after[0]?.status).toBe("open");
    expect(after[0]?.importRowId).toBeNull();
  } finally {
    book.close();
  }
});
