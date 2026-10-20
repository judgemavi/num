import { columnMapSchema, importViewQuerySchema } from "@num/shared";
import { expect, test } from "bun:test";
import { createBankBalance } from "./bank-balances";
import { getImportDetail, listImportView } from "./import-list";
import { at, csv, importCsv, map, tempBook } from "./import-test-book";
import { undoImportBatch } from "./import-undo";
import { importStatement, listImportBatches } from "./imports";

const withBalance = columnMapSchema.parse({ ...map, balance: 3 });

function importWithBalance(book: ReturnType<typeof tempBook>, filename: string, lines: string[]) {
  const result = importStatement(book.db, {
    asOf: "2026-10-07",
    source: "import",
    at,
    accountId: book.account.id,
    filename,
    bytes: csv(lines, true),
    columnMap: withBalance,
  });
  if (result.kind !== "batch") {
    throw new Error("Expected an import batch");
  }
  return result;
}

test("a file without a closing balance has no balance check", () => {
  const book = tempBook();
  try {
    const result = importCsv(book.db, book.account.id, "plain.csv", ["01/02/2026,NORTH MARKET,-12.50"]);
    expect(result.kind).toBe("batch");
    if (result.kind === "batch") {
      expect(result.balanceCheck).toBeNull();
    }
  } finally {
    book.close();
  }
});

test("the balance check gives the difference and whether the account matched its bank before the import", () => {
  const book = tempBook();
  try {
    // No bank balance before: the account did not match. The cleared balance equals the closing balance.
    const first = importWithBalance(book, "jan.csv", ["01/02/2026,NORTH MARKET,-12.50,-12.50"]);
    expect(first.balanceCheck).toEqual({ difference: 0, matchedBefore: false });

    // The account matches its bank now. The next file says the bank has 2.50, but the ledger has 7.50.
    const second = importWithBalance(book, "feb.csv", ["01/05/2026,PAY DEPOSIT,20.00,2.50"]);
    expect(second.balanceCheck).toEqual({ difference: 5000, matchedBefore: true });

    // The batch read, the Imports view and the import detail give the same check.
    const listed = listImportBatches(book.db, book.account.id).items.find((batch) => batch.id === second.id);
    expect(listed?.balanceCheck).toEqual({ difference: 5000, matchedBefore: true });
    const view = listImportView(book.db, importViewQuerySchema.parse({})).items.find((item) => item.id === second.id);
    expect(view?.balanceCheck).toEqual({ difference: 5000, matchedBefore: true });
    expect(getImportDetail(book.db, second.id).item.balanceCheck).toEqual({ difference: 5000, matchedBefore: true });

    // An undone import has no check.
    const undone = undoImportBatch(book.db, second.id, { source: "import", at: "2026-10-08T16:00:00Z" });
    expect(undone.batch.balanceCheck).toBeNull();
    expect(getImportDetail(book.db, second.id).item.balanceCheck).toBeNull();
  } finally {
    book.close();
  }
});

test("a bank balance that does not match before the import sets matchedBefore to false", () => {
  const book = tempBook();
  try {
    createBankBalance(book.db, book.account.id, { date: "2026-01-01", balance: 99_000, source: "ui", at });
    const result = importWithBalance(book, "jan.csv", ["01/02/2026,NORTH MARKET,-12.50,-12.50"]);
    expect(result.balanceCheck).toEqual({ difference: 0, matchedBefore: false });
  } finally {
    book.close();
  }
});

test("the same file again shows its import, and imports again after an undo", () => {
  const book = tempBook();
  try {
    const lines = ["01/02/2026,NORTH MARKET,-12.50"];
    const first = importCsv(book.db, book.account.id, "jan.csv", lines);
    const again = importCsv(book.db, book.account.id, "jan-copy.csv", lines);
    expect(first.kind).toBe("batch");
    expect(again.kind).toBe("batch");
    if (first.kind !== "batch" || again.kind !== "batch") {
      return;
    }
    expect(again.alreadyImported).toBe(true);
    expect(again.id).toBe(first.id);
    expect(again.filename).toBe("jan.csv");

    undoImportBatch(book.db, first.id, { source: "import", at: "2026-10-08T16:00:00Z" });
    const third = importCsv(book.db, book.account.id, "jan-copy.csv", lines);
    expect(third.kind).toBe("batch");
    if (third.kind === "batch") {
      expect(third.alreadyImported).toBe(false);
      expect(third.id).not.toBe(first.id);
      expect(third.filename).toBe("jan-copy.csv");
      expect(third.counts.created).toBe(1);
    }
  } finally {
    book.close();
  }
});
