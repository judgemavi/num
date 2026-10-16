import { accounts, importRows, settings } from "@num/db";
import { ofxPresetId, accountListApiQuerySchema, detectStatementFormat, guessImportAccount, importViewQuerySchema } from "@num/shared";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { archiveAccount, createAccount, getAccount, listAccounts } from "./accounts";
import { createCategory } from "./categories";
import { readSpendingIncreases } from "./spending-increases";
import { listImportView } from "./import-list";
import { resolveImportReview } from "./import-review";
import { importStatement } from "./imports";
import { at, csv, importCsv, map, tempBook } from "./import-test-book";
import { createTransaction, getTransaction, updateTransaction } from "./transactions";

const saved = { source: "ui" as const, at };

test("a reviewed bank match keeps its mirror after the source is unlinked", () => {
  const book = tempBook();
  try {
    const source = createAccount(book.db, { name: "Source", kind: "cash", asOf: "2026-10-07", ...saved });
    const transfer = createTransaction(book.db, {
      accountId: source.id, date: "2026-04-01", amount: -10_000, payeeRaw: "Transfer",
      lines: [{ amount: -10_000, transferAccountId: book.account.id }], ...saved,
    });
    const peerId = transfer.transferPeerId;
    if (!peerId) throw new Error("The transfer needs a mirror");
    createTransaction(book.db, {
      accountId: book.account.id, date: "2026-04-02", amount: 10_000, payeeRaw: "Other deposit",
      lines: [{ amount: 10_000 }], ...saved,
    });
    const batch = importCsv(book.db, book.dir, book.account.id, "review.csv", ["04/02/2026,Deposit,10.00"]);
    expect(batch.kind).toBe("batch");
    const row = book.db.select().from(importRows).where(eq(importRows.outcome, "needs_review")).get();
    if (!row) throw new Error("The bank row needs review");
    resolveImportReview(book.db, row.id, { decision: "match", transactionId: peerId }, saved);
    expect(getTransaction(book.db, peerId)?.mirror).toBe(false);
    updateTransaction(book.db, transfer.id, { lines: [{ amount: -10_000 }], ...saved });
    expect(getTransaction(book.db, peerId)).toMatchObject({
      transferPeerId: null, mirror: false, lines: [expect.objectContaining({ categoryId: null, transferAccountId: null })],
    });
  } finally {
    book.close();
  }
});

test("an OFX import saves its format, opens manual entries and selects its only account", () => {
  const book = tempBook();
  try {
    const text = "<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260401<TRNAMT>-10.00<FITID>synthetic-1<NAME>Example</STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>";
    const result = importStatement(book.db, book.dir, {
      accountId: book.account.id, filename: "statement.ofx", mimeType: "application/x-ofx",
      bytes: new TextEncoder().encode(text), presetId: ofxPresetId, asOf: "2026-10-07", source: "import", at,
    });
    expect(result.kind).toBe("batch");
    const stored = book.db.select().from(accounts).all();
    expect(stored[0]?.importPreset).toBe(ofxPresetId);
    const manual = createTransaction(book.db, {
      accountId: book.account.id, date: "2026-05-01", amount: -5_000, payeeRaw: "Manual",
      lines: [{ amount: -5_000 }], ...saved,
    });
    expect(manual.status).toBe("open");
    expect(guessImportAccount(stored, detectStatementFormat("statement.ofx", text, []), [])).toBe(book.account.id);
    const other = createAccount(book.db, { name: "Other", kind: "cash", asOf: "2026-10-07", ...saved });
    book.db.update(accounts).set({ importPreset: ofxPresetId }).where(eq(accounts.id, other.id)).run();
    expect(guessImportAccount(book.db.select().from(accounts).all(), { kind: "ofx" }, [])).toBeNull();
  } finally {
    book.close();
  }
});

test("account detail and the archive check use the balance at asOf", () => {
  const book = tempBook();
  try {
    createTransaction(book.db, {
      accountId: book.account.id, date: "2026-11-01", amount: -10_000, payeeRaw: "Future",
      lines: [{ amount: -10_000 }], ...saved,
    });
    const asOf = "2026-10-07";
    const list = listAccounts(book.db, accountListApiQuerySchema.parse({ asOf }));
    expect(getAccount(book.db, book.account.id, asOf).balance).toBe(list.items[0]?.balance ?? -1);
    expect(getAccount(book.db, book.account.id, asOf).balance).toBe(0);
    expect(archiveAccount(book.db, book.account.id, { asOf, confirm: false, ...saved }).balance).toBe(0);
  } finally {
    book.close();
  }
});

test("the Imports filter uses the local import date across UTC midnight", () => {
  const book = tempBook();
  try {
    importStatement(book.db, book.dir, {
      accountId: book.account.id, filename: "local.csv", mimeType: "text/csv", columnMap: map,
      bytes: csv(["04/01/2026,Example,-10.00"]), asOf: "2026-10-06", at: "2026-10-07T02:00:00Z", source: "import",
    });
    const local = listImportView(book.db, importViewQuerySchema.parse({ from: "2026-10-06", to: "2026-10-06" }));
    expect(local.total).toBe(1);
    expect(listImportView(book.db, importViewQuerySchema.parse({ from: "2026-10-07", to: "2026-10-07" })).total).toBe(0);
  } finally {
    book.close();
  }
});


test("spending medians round to CAD cents and JPY whole units after a currency change", () => {
  const book = tempBook();
  try {
    book.db.update(settings).set({ value: "KWD" }).where(eq(settings.key, "currency")).run();
    const category = createCategory(book.db, { name: "Example", kind: "expense", ...saved });
    for (const [date, amount] of [["2026-01-01", -1001], ["2026-02-01", -1505], ["2026-03-01", -2500], ["2026-04-01", -5000]] as const) {
      createTransaction(book.db, {
        accountId: book.account.id, date, amount, payeeRaw: "Example",
        lines: [{ amount, categoryId: category.id }], ...saved,
      });
    }
    book.db.update(settings).set({ value: "CAD" }).where(eq(settings.key, "currency")).run();
    expect(readSpendingIncreases(book.db, "2026-04-30")[0]).toMatchObject({ median: 1510, delta: 3490 });
    book.db.update(settings).set({ value: "JPY" }).where(eq(settings.key, "currency")).run();
    expect(readSpendingIncreases(book.db, "2026-04-30")[0]).toMatchObject({ median: 2000, delta: 3000 });
  } finally {
    book.close();
  }
});
