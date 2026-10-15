import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importBatches, importRows, inboxDecisions, migrateDatabase, openDatabase, settings } from "@num/db";
import { columnMapSchema, type ColumnMap, type ImportViewQuery } from "@num/shared";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { listImportView } from "./import-list";
import { importStatement } from "./imports";

const map: ColumnMap = columnMapSchema.parse({
  hasHeader: true,
  date: 0,
  description: 1,
  amount: 2,
  dateOrder: "mdy",
  signConvention: "account",
});

const page: ImportViewQuery = { page: 1, pageSize: 50 };

function tempBook() {
  const dir = mkdtempSync(join(tmpdir(), "num-import-list-"));
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
    openingBalance: 0,
    source: "ui",
    at: "2026-01-01T00:00:00Z",
  });
}

function importCsv(db: Db, dir: string, accountId: string, filename: string, at: string, line: string) {
  const result = importStatement(db, dir, {
    source: "import",
    at,
    accountId,
    filename,
    mimeType: "text/csv",
    bytes: new TextEncoder().encode(`date,description,amount\n${line}\n`),
    columnMap: map,
  });
  if (result.kind !== "batch") {
    throw new Error("Expected a batch");
  }
  return result.id;
}

test("the import list filters by account, status and date", () => {
  const book = tempBook();
  try {
    const everyday = account(book.db, "Everyday");
    const savings = account(book.db, "Savings");
    importCsv(book.db, book.dir, everyday.id, "march.csv", "2026-03-15T12:00:00Z", "03/02/2026,NORTH MARKET,-4.00");
    const aprilReview = importCsv(
      book.db,
      book.dir,
      everyday.id,
      "april.csv",
      "2026-04-02T12:00:00Z",
      "04/02/2026,CITY TRANSIT,-2.00",
    );
    const undone = importCsv(book.db, book.dir, savings.id, "undone.csv", "2026-03-20T12:00:00Z", "03/03/2026,PAY DEPOSIT,8.00");
    const dismissed = importCsv(
      book.db,
      book.dir,
      savings.id,
      "dismissed.csv",
      "2026-04-03T12:00:00Z",
      "04/03/2026,NORTH MARKET,-1.00",
    );
    const openUnreadable = importCsv(
      book.db,
      book.dir,
      savings.id,
      "open.csv",
      "2026-04-04T12:00:00Z",
      "04/04/2026,CITY TRANSIT,-3.00",
    );

    book.db.update(importRows).set({ outcome: "needs_review" }).where(eq(importRows.batchId, aprilReview)).run();
    book.db.update(importBatches).set({ undoneAt: "2026-03-21T12:00:00Z" }).where(eq(importBatches.id, undone)).run();
    book.db
      .update(importRows)
      .set({ outcome: "needs_review" })
      .where(eq(importRows.batchId, undone))
      .run();
    const unreadable = [{ line: 2, raw: "bad", reason: "date_unreadable" as const }];
    book.db.update(importBatches).set({ unreadableJson: unreadable }).where(eq(importBatches.id, dismissed)).run();
    book.db.update(importBatches).set({ unreadableJson: unreadable }).where(eq(importBatches.id, openUnreadable)).run();
    book.db
      .insert(inboxDecisions)
      .values({
        itemKey: `import_unreadable:${dismissed}:2`,
        decision: "not_a_transaction",
        decidedAt: "2026-04-05T12:00:00Z",
      })
      .run();

    const all = listImportView(book.db, page);
    expect(all.total).toBe(5);
    expect(all.items.map((item) => item.filename)).toEqual([
      "open.csv",
      "dismissed.csv",
      "april.csv",
      "undone.csv",
      "march.csv",
    ]);
    expect(all.items.map((item) => item.status)).toEqual(["needs_you", "imported", "needs_you", "undone", "imported"]);

    const byAccount = listImportView(book.db, { ...page, accountId: everyday.id });
    expect(byAccount.items.map((item) => item.filename)).toEqual(["april.csv", "march.csv"]);

    const needsYou = listImportView(book.db, { ...page, status: "needs_you" });
    expect(needsYou.items.map((item) => item.filename)).toEqual(["open.csv", "april.csv"]);
    expect(needsYou.total).toBe(2);
    expect(listImportView(book.db, { ...page, status: "undone" }).total).toBe(1);
    expect(listImportView(book.db, { ...page, status: "imported" }).total).toBe(2);

    const april = listImportView(book.db, { ...page, from: "2026-04-01", to: "2026-04-30" });
    expect(april.items.map((item) => item.filename)).toEqual(["open.csv", "dismissed.csv", "april.csv"]);

    const second = listImportView(book.db, { ...page, page: 2, pageSize: 1 });
    expect(second.total).toBe(5);
    expect(second.items.map((item) => item.filename)).toEqual(["dismissed.csv"]);

    const past = listImportView(book.db, { ...page, page: 9, pageSize: 1 });
    expect(past.items).toEqual([]);
    expect(past.total).toBe(5);
  } finally {
    book.close();
  }
});
