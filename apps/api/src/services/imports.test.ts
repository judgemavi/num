import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accounts, auditLog, migrateDatabase, openDatabase, settings, transactions } from "@num/db";
import { columnMapSchema, type ColumnMap } from "@num/shared";
import { expect, test } from "bun:test";
import { eq, isNull } from "drizzle-orm";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { importStatement, listImportBatches } from "./imports";
import { undoImportBatch } from "./import-undo";
import { createTransaction, getTransaction, updateTransaction } from "./transactions";

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
    sqlite,
    account,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function csv(lines: string[], balance = false): Uint8Array {
  const header = balance ? "date,description,amount,balance" : "date,description,amount";
  return new TextEncoder().encode([header, ...lines].join("\n") + "\n");
}

function importCsv(
  db: Db,
  dir: string,
  accountId: string,
  filename: string,
  lines: string[],
  columnMap: ColumnMap | null = map,
) {
  return importStatement(db, dir, {
    source: "import",
    at,
    accountId,
    filename,
    mimeType: "text/csv",
    bytes: csv(lines),
    columnMap,
  });
}

function activeCount(db: Db): number {
  return db.select({ id: transactions.id }).from(transactions).where(isNull(transactions.deletedAt)).all().length;
}

test("the same file two times creates no new transactions", () => {
  const book = tempBook();
  try {
    const lines = ["01/02/2026,NORTH MARKET,-12.50", "01/03/2026,PAY DEPOSIT,20.00"];
    const bytes = csv(lines);
    const first = importStatement(book.db, book.dir, {
      source: "import",
      at,
      accountId: book.account.id,
      filename: "january.csv",
      mimeType: "text/csv",
      bytes,
      columnMap: map,
    });
    const second = importStatement(book.db, book.dir, {
      source: "import",
      at,
      accountId: book.account.id,
      filename: "january-copy.csv",
      mimeType: "text/csv",
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
    importCsv(book.db, book.dir, book.account.id, "week-a.csv", [
      "01/05/2026,NORTH MARKET,-10.00",
      "01/06/2026,PAY DEPOSIT,20.00",
    ]);
    const second = importCsv(book.db, book.dir, book.account.id, "week-b.csv", [
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
    const result = importCsv(book.db, book.dir, book.account.id, "twins.csv", [
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

test("one match candidate links the row and several candidates need review", () => {
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
    const one = importCsv(book.db, book.dir, book.account.id, "one.csv", ["04/02/2026,RENT PAYMENT,-10.00"]);
    expect(one.kind).toBe("batch");
    if (one.kind !== "batch") {
      return;
    }
    expect(one.counts.matched).toBe(1);
    expect(one.counts.created).toBe(0);
    expect(activeCount(book.db)).toBe(1);
    const linked = book.db.select().from(transactions).all()[0];
    expect(linked?.importRowId).toBeTruthy();

    createTransaction(book.db, {
      accountId: book.account.id,
      date: "2026-05-01",
      amount: -2500,
      payeeRaw: "POWER",
      status: "open",
      lines: [{ amount: -2500 }],
      source: "ui",
      at,
    });
    createTransaction(book.db, {
      accountId: book.account.id,
      date: "2026-05-03",
      amount: -2500,
      payeeRaw: "POWER EAST",
      status: "open",
      lines: [{ amount: -2500 }],
      source: "ui",
      at,
    });
    const several = importCsv(book.db, book.dir, book.account.id, "several.csv", ["05/02/2026,POWER BILL,-25.00"]);
    expect(several.kind).toBe("batch");
    if (several.kind !== "batch") {
      return;
    }
    expect(several.counts.needsReview).toBe(1);
    expect(several.counts.matched).toBe(0);
    expect(several.counts.created).toBe(0);
    const openPower = book.db
      .select()
      .from(transactions)
      .where(eq(transactions.date, "2026-05-01"))
      .all();
    expect(openPower.every((row) => row.importRowId === null)).toBe(true);
    expect(activeCount(book.db)).toBe(3);
  } finally {
    book.close();
  }
});

test("undo removes only unedited, unreconciled rows", () => {
  const book = tempBook();
  try {
    createTransaction(book.db, {
      accountId: book.account.id,
      date: "2026-01-13",
      amount: -400,
      payeeRaw: "MANUAL",
      status: "open",
      lines: [{ amount: -400 }],
      source: "ui",
      at,
    });
    const result = importCsv(book.db, book.dir, book.account.id, "month.csv", [
      "01/10/2026,KEEP,-1.00",
      "01/11/2026,EDIT,-2.00",
      "01/12/2026,LOCK,-3.00",
      "01/13/2026,MANUAL MATCH,-4.00",
    ]);
    expect(result.kind).toBe("batch");
    if (result.kind !== "batch") {
      return;
    }
    expect(result.counts.created).toBe(3);
    expect(result.counts.matched).toBe(1);

    const rows = book.db.select().from(transactions).all();
    const edit = rows.find((row) => row.payeeRaw === "EDIT");
    const lock = rows.find((row) => row.payeeRaw === "LOCK");
    const manual = rows.find((row) => row.payeeRaw === "MANUAL");
    if (!edit || !lock || !manual) {
      throw new Error("Imported rows are missing");
    }
    const current = getTransaction(book.db, edit.id);
    if (!current) {
      throw new Error("Edited row is missing");
    }
    updateTransaction(book.db, edit.id, {
      accountId: current.accountId,
      date: current.date,
      amount: current.amount,
      payeeRaw: current.payeeRaw,
      notes: "Changed after import",
      status: "open",
      lines: current.lines.map((line) => ({ amount: line.amount, tagIds: line.tagIds })),
      source: "ui",
      at: "2026-10-08T16:00:00Z",
    });
    book.sqlite.query("update transactions set status = 'reconciled' where id = ?").run(lock.id);

    const undone = undoImportBatch(book.db, result.id, { source: "import", at: "2026-10-09T16:00:00Z" });
    expect(undone.blocked.map((row) => row.reason).sort()).toEqual(["edited", "reconciled"]);
    const after = book.db.select().from(transactions).all();
    expect(after.find((row) => row.payeeRaw === "KEEP")?.deletedAt).toBe("2026-10-09T16:00:00Z");
    expect(after.find((row) => row.payeeRaw === "EDIT")?.deletedAt).toBeNull();
    expect(after.find((row) => row.payeeRaw === "LOCK")?.deletedAt).toBeNull();
    expect(after.find((row) => row.payeeRaw === "MANUAL")?.deletedAt).toBeNull();
    expect(after.find((row) => row.payeeRaw === "MANUAL")?.importRowId).toBeNull();
    expect(undone.batch.undoneAt).toBeNull();
  } finally {
    book.close();
  }
});

test("a column map is saved after the first import", () => {
  const book = tempBook();
  try {
    const withBalance = columnMapSchema.parse({ ...map, balance: 3 });
    const first = importStatement(book.db, book.dir, {
      source: "import",
      at,
      accountId: book.account.id,
      filename: "first.csv",
      mimeType: "text/csv",
      bytes: csv(["01/02/2026,NORTH MARKET,-12.50,100.00"], true),
      columnMap: withBalance,
    });
    expect(first.kind).toBe("batch");
    if (first.kind !== "batch") {
      return;
    }
    expect(first.closingBalance).toBe(10000);
    expect(first.closingDate).toBe("2026-01-02");
    const saved = book.db.select().from(accounts).where(eq(accounts.id, book.account.id)).get();
    expect(columnMapSchema.parse(JSON.parse(saved?.columnMap ?? "null"))).toEqual(withBalance);

    const second = importStatement(book.db, book.dir, {
      source: "import",
      at,
      accountId: book.account.id,
      filename: "second.csv",
      mimeType: "text/csv",
      bytes: csv(["01/04/2026,CITY TRANSIT,-3.25,96.75"], true),
      columnMap: null,
    });
    expect(second.kind).toBe("batch");
    if (second.kind !== "batch") {
      return;
    }
    expect(second.counts.created).toBe(1);
    const again = book.db.select().from(accounts).where(eq(accounts.id, book.account.id)).get();
    expect(again?.columnMap).toBe(saved?.columnMap);
    expect(listImportBatches(book.db, book.account.id).items).toHaveLength(2);
  } finally {
    book.close();
  }
});

