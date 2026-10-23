import { bankBalances, importRows, transactions } from "@num/db";
import { importViewQuerySchema } from "@num/shared";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { createAccount } from "./accounts";
import { createBankBalance, listBankBalances } from "./bank-balances";
import { getImportDetail, listImportView } from "./import-list";
import { resolveImportReview } from "./import-review";
import { undoImportBatch } from "./import-undo";
import { importStatement } from "./imports";
import { at, csv, importCsv, map, tempBook } from "./import-test-book";
import { getsImports } from "./transaction-test-book";
import { createTransaction, getTransaction, updateTransaction } from "./transactions";

const saved = { source: "ui" as const, at };

function withBalance(book: ReturnType<typeof tempBook>, amount = "-10.00", balance = "90.00", date = "03/01/2026") {
  const result = importStatement(book.db, {
    asOf: "2026-10-07", source: "import", at, accountId: book.account.id,
    filename: "statement.csv",
    bytes: csv([`${date},Example,${amount},${balance}`], true), columnMap: { ...map, balance: 3 },
  });
  if (result.kind !== "batch") throw new Error("Expected a batch");
  return result;
}

for (const prior of ["manual", "import", "none"] as const) {
  test(`undo restores the bank balance before import: ${prior}`, () => {
    const book = tempBook();
    try {
      if (prior === "manual") {
        createBankBalance(book.db, book.account.id, { date: "2026-03-01", balance: 80_000, ...saved });
      } else if (prior === "import") {
        withBalance(book, "-20.00", "80.00");
      }
      const before = listBankBalances(book.db, book.account.id).items;
      const batch = withBalance(book);
      expect(listBankBalances(book.db, book.account.id).items[0]?.balance).toBe(90_000);
      expect(undoImportBatch(book.db, batch.id, saved).blocked).toEqual([]);
      expect(listBankBalances(book.db, book.account.id).items).toEqual(before);
      expect(book.sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      book.close();
    }
  });
}

test("undo of a duplicate-only import restores the bank balance", () => {
  const book = tempBook();
  try {
    withBalance(book);
    const before = book.db.select().from(bankBalances).all();
    const batch = withBalance(book, "-10.00", "80.00");
    expect(batch.counts.duplicate).toBe(1);
    undoImportBatch(book.db, batch.id, saved);
    expect(book.db.select().from(bankBalances).all()).toEqual(before);
  } finally {
    book.close();
  }
});

for (const reviewed of [false, true]) {
  test(`undo restores a matched mirror and its earlier status${reviewed ? " after review" : ""}`, () => {
    const book = tempBook();
    try {
      const other = createAccount(book.db, { asOf: "2026-10-07", name: "Other", kind: "savings", openingBalance: 0, ...saved });
      const source = createTransaction(book.db, {
        accountId: other.id, date: "2026-03-01", amount: -10_000, payeeRaw: "Move funds",
        lines: [{ amount: -10_000, transferAccountId: book.account.id }], ...saved,
      });
      if (!source.transferPeerId) throw new Error("Expected a mirror");
      const before = getTransaction(book.db, source.transferPeerId);
      if (reviewed) {
        createTransaction(book.db, {
          accountId: book.account.id, date: "2026-03-01", amount: 10_000, payeeRaw: "Move funds",
          lines: [{ amount: 10_000 }], ...saved,
        });
      }
      const batch = importCsv(book.db, book.account.id, "mirror.csv", ["03/01/2026,Move funds,10.00"]);
      if (batch.kind !== "batch") throw new Error("Expected a batch");
      if (reviewed) {
        const row = book.db.select().from(importRows).where(eq(importRows.batchId, batch.id)).get();
        if (!row) throw new Error("Expected an import row");
        resolveImportReview(book.db, row.id, { decision: "match", transactionId: source.transferPeerId }, saved);
      }
      expect(getTransaction(book.db, source.transferPeerId)?.mirror).toBe(false);
      undoImportBatch(book.db, batch.id, saved);
      expect(getTransaction(book.db, source.transferPeerId)).toEqual(before);
      expect(book.db.select().from(transactions).where(eq(transactions.id, source.id)).get()?.transferPeerId).toBe(source.transferPeerId);
    } finally {
      book.close();
    }
  });
}


for (const olderFirst of [true, false]) {
  test(`undo of overlapping imports leaves no balance: ${olderFirst ? "A then B" : "B then A"}`, () => {
    const book = tempBook();
    try {
      const a = withBalance(book, "-20.00", "80.00", "09/30/2026");
      const balanceA = listBankBalances(book.db, book.account.id).items;
      const b = withBalance(book, "-10.00", "90.00", "09/30/2026");
      expect(listBankBalances(book.db, book.account.id).items[0]).toMatchObject({
        date: "2026-09-30", balance: 90_000, importBatchId: b.id,
      });
      const first = undoImportBatch(book.db, olderFirst ? a.id : b.id, saved);
      expect(first.blocked).toEqual([]);
      expect(first.batch.undoneAt).toBe(at);
      if (olderFirst) {
        expect(listBankBalances(book.db, book.account.id).items[0]?.importBatchId).toBe(b.id);
      } else {
        expect(listBankBalances(book.db, book.account.id).items).toEqual(balanceA);
      }
      const second = undoImportBatch(book.db, olderFirst ? b.id : a.id, saved);
      expect(second.blocked).toEqual([]);
      expect(second.batch.undoneAt).toBe(at);
      expect(listBankBalances(book.db, book.account.id).items).toEqual([]);
    } finally {
      book.close();
    }
  });
}

const month = ["01/20/2026,KEEP,-1.00", "01/21/2026,EDIT,-2.00", "01/13/2026,MANUAL MATCH,-4.00"];

function importMonth(db: Db, accountId: string, lines = month) {
  const result = importCsv(db, accountId, "month.csv", lines);
  if (result.kind !== "batch") throw new Error("Expected a batch");
  return result;
}

/** A book with a manual transaction, an import of `lines` and an edit of the created row "EDIT". */
function editedImport(lines = month) {
  const book = tempBook();
  getsImports(book.db, book.account.id);
  const manual = createTransaction(book.db, {
    accountId: book.account.id, date: "2026-01-12", amount: -4_000, payeeRaw: "MANUAL",
    lines: [{ amount: -4_000 }], ...saved,
  });
  const first = importMonth(book.db, book.account.id, lines);
  const edit = book.db.select().from(transactions).all().find((row) => row.payeeRaw === "EDIT");
  const current = edit ? getTransaction(book.db, edit.id) : null;
  if (!current) throw new Error("Expected the created row");
  updateTransaction(book.db, current.id, {
    lines: current.lines.map((line) => ({ amount: line.amount, memo: "Changed", tagIds: line.tagIds })),
    ...saved,
  });
  return { book, manual, first, edited: current.id };
}

test("a partial undo counts only active rows and the same file imports again", () => {
  const { book, manual, first, edited } = editedImport();
  try {
    const undone = undoImportBatch(book.db, first.id, saved);
    expect(undone.blocked.map((row) => row.reason)).toEqual(["edited"]);
    expect(undone.batch.undoneAt).toBeNull();
    expect(undone.batch.counts).toMatchObject({ created: 1, matched: 0, duplicate: 0, needsReview: 0 });
    expect(getImportDetail(book.db, first.id).item).toMatchObject({ status: "partly_undone", counts: { created: 1, matched: 0 } });
    expect(getTransaction(book.db, manual.id)?.status).toBe("open");

    const again = importMonth(book.db, book.account.id);
    expect(again.alreadyImported).toBe(false);
    expect(again.counts).toMatchObject({ created: 1, matched: 1, duplicate: 1, needsReview: 0 });
    expect(getTransaction(book.db, manual.id)).toMatchObject({ status: "cleared", importRowId: expect.any(String) });
    expect(book.db.select().from(transactions).all().map((row) => row.payeeRaw).sort()).toEqual(["EDIT", "KEEP", "MANUAL"]);
    expect(book.db.select().from(importRows).where(eq(importRows.transactionId, edited)).all()).toHaveLength(1);

    const third = importMonth(book.db, book.account.id);
    expect(third).toMatchObject({ alreadyImported: true, id: again.id });
    const view = listImportView(book.db, importViewQuerySchema.parse({ status: "partly_undone" }));
    expect(view.items.map((item) => item.id)).toEqual([first.id]);
  } finally {
    book.close();
  }
});

test("needs you wins over partly undone while an unreadable line has no decision", () => {
  const { book, first } = editedImport([...month, "not a date,BROKEN,-9.00"]);
  try {
    expect(first.counts.unreadable).toBe(1);
    undoImportBatch(book.db, first.id, saved);
    expect(getImportDetail(book.db, first.id).item.status).toBe("needs_you");
  } finally {
    book.close();
  }
});
