import { transactions } from "@num/db";
import { columnMapSchema } from "@num/shared";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { balanceOf } from "./account-balance";
import { createBankBalance, listBankBalances, listBankStatuses } from "./bank-balances";
import { importStatement } from "./imports";
import { at, csv, importCsv, tempBook } from "./import-test-book";
import { undoImportBatch } from "./import-undo";
import { getsImports } from "./transaction-test-book";
import { createTransaction, deleteTransaction, updateTransaction } from "./transactions";

const saved = { source: "ui" as const, at };
type Book = ReturnType<typeof tempBook>;

function spend(book: Book, date: string, amount: number, payeeRaw = "Shop") {
  return createTransaction(book.db, { accountId: book.account.id, date, amount, payeeRaw, lines: [{ amount }], ...saved });
}

function statusOf(book: Book) {
  const single = listBankBalances(book.db, book.account.id).status;
  expect(listBankStatuses(book.db).items.find((row) => row.accountId === book.account.id) ?? null).toEqual(single);
  return single;
}

test("an open transaction on or before the bank balance date causes no difference, and other balances count it", () => {
  const book = tempBook();
  try {
    getsImports(book.db, book.account.id);
    const logged = spend(book, "2026-01-20", -5_000);
    expect(logged.status).toBe("open");
    createBankBalance(book.db, book.account.id, { date: "2026-01-31", balance: 0, ...saved });
    expect(statusOf(book)).toMatchObject({ clearedBalance: 0, difference: 0, openingSuggestion: null });
    expect(balanceOf(book.db, book.account, "2026-01-31")).toBe(-5_000);
  } finally {
    book.close();
  }
});

test("a change or a delete of a cleared transaction causes a difference", () => {
  const book = tempBook();
  try {
    const balanceMap = columnMapSchema.parse({
      hasHeader: true, date: 0, description: 1, amount: 2, balance: 3,
      dateOrder: "mdy", signConvention: "account", decimalSeparator: ".",
    });
    importStatement(book.db, book.dir, {
      asOf: "2026-10-07", source: "import", at, accountId: book.account.id, filename: "jan.csv", mimeType: "text/csv",
      bytes: csv(["01/05/2026,Shop,-10.00,-10.00", "01/31/2026,Cafe,-5.00,-15.00"], true), columnMap: balanceMap,
    });
    expect(statusOf(book)).toMatchObject({ clearedBalance: -15_000, difference: 0 });
    const [shop, cafe] = book.db.select().from(transactions).where(eq(transactions.accountId, book.account.id))
      .orderBy(transactions.date).all();
    if (!shop || !cafe) throw new Error("Expected two imported transactions");
    updateTransaction(book.db, shop.id, {
      accountId: shop.accountId, date: shop.date, amount: -12_000, payeeRaw: shop.payeeRaw, lines: [{ amount: -12_000 }], ...saved,
    });
    expect(statusOf(book)).toMatchObject({ clearedBalance: -17_000, difference: -2_000 });
    deleteTransaction(book.db, cafe.id, saved);
    expect(statusOf(book)).toMatchObject({ clearedBalance: -12_000, difference: 3_000 });
  } finally {
    book.close();
  }
});

test("the opening suggestion and the earlier equal bank balance use the cleared balance", () => {
  const book = tempBook();
  try {
    getsImports(book.db, book.account.id);
    spend(book, "2026-02-01", -20_000);
    createBankBalance(book.db, book.account.id, { date: "2026-02-05", balance: -20_000, ...saved });
    createBankBalance(book.db, book.account.id, { date: "2026-02-15", balance: -15_000, ...saved });
    expect(statusOf(book)).toMatchObject({
      clearedBalance: 0,
      difference: 15_000,
      openingSuggestion: { amount: -15_000, date: "2026-01-31" },
    });
  } finally {
    book.close();
  }
});

test("an import undo that sets a matched transaction back to open changes the cleared balance", () => {
  const book = tempBook();
  try {
    getsImports(book.db, book.account.id);
    spend(book, "2026-04-01", -10_000, "RENT");
    createBankBalance(book.db, book.account.id, { date: "2026-04-30", balance: -10_000, ...saved });
    expect(statusOf(book)).toMatchObject({ clearedBalance: 0, difference: 10_000 });
    const result = importCsv(book.db, book.dir, book.account.id, "april.csv", ["04/02/2026,RENT PAYMENT,-10.00"]);
    if (result.kind !== "batch") throw new Error("Expected a batch");
    expect(result.counts.matched).toBe(1);
    expect(statusOf(book)).toMatchObject({ clearedBalance: -10_000, difference: 0 });
    undoImportBatch(book.db, result.id, { source: "import", at: "2026-10-09T16:00:00Z" });
    expect(statusOf(book)).toMatchObject({ clearedBalance: 0, difference: 10_000 });
  } finally {
    book.close();
  }
});
