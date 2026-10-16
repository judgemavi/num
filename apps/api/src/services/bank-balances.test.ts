import { expectCode } from "./test-support";
import { auditLog, bankBalances, valuations } from "@num/db";
import { columnMapSchema } from "@num/shared";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createAccount } from "./accounts";
import {
  createBankBalance,
  deleteBankBalance,
  listBankBalances,
  listBankStatuses,
  updateBankBalance,
} from "./bank-balances";
import { importStatement } from "./imports";
import { at, csv, tempBook } from "./import-test-book";
import { undoImportBatch } from "./import-undo";

import { createTransaction, updateTransaction } from "./transactions";

const saved = { source: "ui" as const, at };
const balanceMap = columnMapSchema.parse({
  hasHeader: true,
  date: 0,
  description: 1,
  amount: 2,
  balance: 3,
  dateOrder: "mdy",
  signConvention: "account",
  decimalSeparator: ".",
});

function spend(book: ReturnType<typeof tempBook>, date: string, amount: number) {
  return createTransaction(book.db, {
    accountId: book.account.id,
    date,
    amount,
    payeeRaw: "Shop",
    lines: [{ amount }],
    ...saved,
  });
}

function importWithBalance(book: ReturnType<typeof tempBook>, filename: string, lines: string[]) {
  const result = importStatement(book.db, book.dir, {
    asOf: "2026-10-07",
    source: "import",
    at,
    accountId: book.account.id,
    filename,
    mimeType: "text/csv",
    bytes: csv(lines, true),
    columnMap: balanceMap,
  });
  if (result.kind !== "batch") {
    throw new Error("Expected a batch");
  }
  return result;
}

function statusOf(book: ReturnType<typeof tempBook>) {
  const single = listBankBalances(book.db, book.account.id).status;
  expect(listBankStatuses(book.db).items.find((row) => row.accountId === book.account.id) ?? null).toEqual(single);
  return single;
}

test("a bank balance is saved when it is different, and the status is calculated each time", () => {
  const book = tempBook();
  try {
    expect(statusOf(book)).toBeNull();
    const shop = spend(book, "2026-02-01", -20_000);
    createBankBalance(book.db, book.account.id, { date: "2026-02-15", balance: -37_120, ...saved });
    expect(statusOf(book)).toMatchObject({
      date: "2026-02-15",
      bankBalance: -37_120,
      calculatedBalance: -20_000,
      difference: 17_120,
    });
    updateTransaction(book.db, shop.id, {
      accountId: shop.accountId,
      date: shop.date,
      amount: -37_120,
      payeeRaw: shop.payeeRaw,
      lines: [{ amount: -37_120 }],
      ...saved,
    });
    expect(statusOf(book)).toMatchObject({ calculatedBalance: -37_120, difference: 0, openingSuggestion: null });
    spend(book, "2026-02-10", -1_000);
    expect(statusOf(book)?.difference).toBe(-1_000);
  } finally {
    book.close();
  }
});

test("the status uses the latest bank balance and only accounts with a bank balance have one", () => {
  const book = tempBook();
  try {
    const other = createAccount(book.db, { asOf: "2026-10-07", name: "Other", kind: "savings", openingBalance: 0, ...saved });
    createBankBalance(book.db, book.account.id, { date: "2026-03-01", balance: 5_000, ...saved });
    createBankBalance(book.db, book.account.id, { date: "2026-05-01", balance: 0, ...saved });
    createBankBalance(book.db, book.account.id, { date: "2026-04-01", balance: 9_000, ...saved });
    const items = listBankStatuses(book.db).items;
    expect(items.map((item) => item.accountId)).toEqual([book.account.id]);
    expect(items[0]).toMatchObject({ date: "2026-05-01", difference: 0 });
    expect(items.some((item) => item.accountId === other.id)).toBe(false);
  } finally {
    book.close();
  }
});

test("the opening suggestion adds the difference, and it is absent when an earlier bank balance matches", () => {
  const book = tempBook();
  try {
    spend(book, "2026-02-01", -20_000);
    createBankBalance(book.db, book.account.id, { date: "2026-02-15", balance: -15_000, ...saved });
    expect(statusOf(book)?.openingSuggestion).toEqual({ amount: 5_000, date: "2026-01-31" });
    createBankBalance(book.db, book.account.id, { date: "2026-02-05", balance: -20_000, ...saved });
    expect(statusOf(book)?.difference).toBe(-5_000);
    expect(statusOf(book)?.openingSuggestion).toBeNull();
  } finally {
    book.close();
  }
});

test("a bank balance has one row for each date, and each change is audited in one write", () => {
  const book = tempBook();
  try {
    const first = createBankBalance(book.db, book.account.id, { date: "2026-02-15", balance: 1_000, ...saved });
    expectCode(() => createBankBalance(book.db, book.account.id, { date: "2026-02-15", balance: 2_000, ...saved }), "bank_balance_exists");
    const second = createBankBalance(book.db, book.account.id, { date: "2026-03-15", balance: 2_000, ...saved });
    expectCode(() => updateBankBalance(book.db, book.account.id, second.id, { date: "2026-02-15", balance: 2_000, ...saved }), "bank_balance_exists");
    updateBankBalance(book.db, book.account.id, second.id, { date: "2026-03-20", balance: 3_000, ...saved });
    deleteBankBalance(book.db, book.account.id, first.id, saved);
    expectCode(() => deleteBankBalance(book.db, book.account.id, first.id, saved), "bank_balance_not_found");
    const rows = book.db.select().from(bankBalances).all();
    expect(rows).toEqual([{ ...second, date: "2026-03-20", balance: 3_000 }]);
    const actions = book.db.select().from(auditLog).where(eq(auditLog.entity, "bank_balances")).all().map((row) => row.action).sort();
    expect(actions.filter((action) => action !== "create")).toEqual(["delete", "update"]);
  } finally {
    book.close();
  }
});

test("an import with a closing balance saves a bank balance, replaces one on the same date, and undo restores it", () => {
  const book = tempBook();
  try {
    createBankBalance(book.db, book.account.id, { date: "2026-01-31", balance: 10, ...saved });
    createBankBalance(book.db, book.account.id, { date: "2026-01-10", balance: 7_000, ...saved });
    const batch = importWithBalance(book, "jan.csv", ["01/05/2026,Shop,-10.00,-10.00", "01/31/2026,Cafe,-5.00,-15.00"]);
    const rows = book.db.select().from(bankBalances).orderBy(bankBalances.date).all();
    expect(rows.map((row) => [row.date, row.balance, row.importBatchId])).toEqual([
      ["2026-01-10", 7_000, null],
      ["2026-01-31", -15_000, batch.id],
    ]);
    expect(statusOf(book)).toMatchObject({ date: "2026-01-31", difference: 0 });

    undoImportBatch(book.db, batch.id, { source: "ui", at });
    expect(book.db.select().from(bankBalances).orderBy(bankBalances.date).all().map((row) => [row.date, row.balance, row.importBatchId])).toEqual([
      ["2026-01-10", 7_000, null], ["2026-01-31", 10, null],
    ]);
  } finally {
    book.close();
  }
});


test("bank status uses the valuation on its date for each valuation account kind", () => {
  const book = tempBook();
  try {
    for (const kind of ["investment", "property", "mortgage", "loan"] as const) {
      const account = createAccount(book.db, { asOf: "2026-10-07", name: kind, kind, openingBalance: 80_000, ...saved });
      for (const [date, balance] of [["2026-02-01", 40_000], ["2026-04-01", 90_000]] as const) {
        book.db.insert(valuations).values({ id: crypto.randomUUID(), accountId: account.id, date, balance }).run();
      }
      createTransaction(book.db, {
        accountId: account.id, date: "2026-02-02", amount: 2_000,
        payeeRaw: "Adjustment", lines: [{ amount: 2_000 }], ...saved,
      });
      createBankBalance(book.db, account.id, { date: "2026-03-01", balance: 42_000, ...saved });
      const status = listBankBalances(book.db, account.id).status;
      expect(status).toMatchObject({ calculatedBalance: 42_000, difference: 0 });
      expect(listBankStatuses(book.db).items.find((row) => row.accountId === account.id) ?? null).toEqual(status);
    }
  } finally {
    book.close();
  }
});


test("a bank opening suggestion stops at the valuation date", () => {
  const book = tempBook();
  try {
    for (const kind of ["investment", "property", "mortgage", "loan"] as const) {
      const account = createAccount(book.db, { asOf: "2026-10-07", name: kind, kind, openingBalance: 10_000, ...saved });
      book.db.insert(valuations).values({ id: crypto.randomUUID(), accountId: account.id, date: "2026-03-01", balance: 20_000 }).run();
      createBankBalance(book.db, account.id, { date: "2026-02-28", balance: 15_000, ...saved });
      const before = listBankBalances(book.db, account.id).status;
      expect(before?.openingSuggestion).toEqual({ amount: 15_000, date: "2026-10-07" });
      expect(listBankStatuses(book.db).items.find((row) => row.accountId === account.id) ?? null).toEqual(before);
      for (const date of ["2026-03-01", "2026-03-02"]) {
        createBankBalance(book.db, account.id, { date, balance: 25_000, ...saved });
        const after = listBankBalances(book.db, account.id).status;
        expect(after).toMatchObject({ difference: -5_000, openingSuggestion: null });
        expect(listBankStatuses(book.db).items.find((row) => row.accountId === account.id) ?? null).toEqual(after);
      }
    }
  } finally {
    book.close();
  }
});
