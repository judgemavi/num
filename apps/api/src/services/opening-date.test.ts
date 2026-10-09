import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accounts, migrateDatabase, openDatabase, settings, transactions } from "@num/db";
import { columnMapSchema, type ColumnMap } from "@num/shared";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db";
import { getAccount, createAccount } from "./accounts";
import { compareCheckpoint } from "./checkpoints";
import { importStatement } from "./imports";

const at = "2026-10-07T16:00:00Z";
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

function tempBook() {
  const dir = mkdtempSync(join(tmpdir(), "num-opening-"));
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

function storedOpening(db: Db, accountId: string): string | null {
  const row = db.select({ openingDate: accounts.openingDate }).from(accounts).where(eq(accounts.id, accountId)).get();
  if (!row) {
    throw new Error("Account is missing");
  }
  return row.openingDate;
}

function importCsv(db: Db, dir: string, accountId: string, filename: string, lines: string[]) {
  const bytes = new TextEncoder().encode(["date,description,amount", ...lines].join("\n") + "\n");
  const result = importStatement(db, dir, {
    source: "import",
    at,
    accountId,
    filename,
    mimeType: "text/csv",
    bytes,
    columnMap: map,
  });
  expect(result.kind).toBe("batch");
  return result;
}

test("an import of older rows moves the effective opening date and checkpoint help includes them", () => {
  const book = tempBook();
  try {
    const account = createAccount(book.db, {
      name: "Everyday",
      institution: null,
      kind: "chequing",
      openingBalance: 0,
      ...saved,
    });
    expect(storedOpening(book.db, account.id)).toBeNull();
    expect(getAccount(book.db, account.id)).toMatchObject({
      openingDate: "2026-10-07",
      openingAutomatic: true,
      automaticOpeningDate: "2026-10-07",
    });

    importCsv(book.db, book.dir, account.id, "january.csv", ["01/15/2026,Shop,-12.50"]);
    expect(storedOpening(book.db, account.id)).toBeNull();
    expect(getAccount(book.db, account.id)).toMatchObject({
      openingDate: "2026-01-14",
      openingAutomatic: true,
      automaticOpeningDate: "2026-01-14",
    });

    const row = book.db.select().from(transactions).where(eq(transactions.accountId, account.id)).get();
    if (!row) {
      throw new Error("Import did not create a transaction");
    }
    const help = compareCheckpoint(book.db, account.id, { date: "2026-01-15", statementBalance: 0 });
    expect(help.help).toContainEqual({
      code: "uncleared",
      transaction: { id: row.id, date: "2026-01-15", payee: "Shop", amount: -1250 },
    });

    importCsv(book.db, book.dir, account.id, "december.csv", ["12/01/2025,Older shop,-4.00"]);
    expect(getAccount(book.db, account.id).openingDate).toBe("2025-11-30");
  } finally {
    book.close();
  }
});

test("a user-set opening date does not move when older rows are imported", () => {
  const book = tempBook();
  try {
    const account = createAccount(book.db, {
      name: "Everyday",
      institution: null,
      kind: "chequing",
      openingDate: "2026-06-01",
      openingBalance: 0,
      ...saved,
    });
    importCsv(book.db, book.dir, account.id, "january.csv", ["01/15/2026,Shop,-12.50"]);
    expect(storedOpening(book.db, account.id)).toBe("2026-06-01");
    expect(getAccount(book.db, account.id)).toMatchObject({
      openingDate: "2026-06-01",
      openingAutomatic: false,
      automaticOpeningDate: "2026-01-14",
    });
  } finally {
    book.close();
  }
});
