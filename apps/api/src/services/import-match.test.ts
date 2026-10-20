import { transactions } from "@num/db";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createAccount } from "./accounts";
import { undoImportBatch } from "./import-undo";
import { createTransaction, getTransaction, updateTransaction } from "./transactions";
import { at, tempBook, importCsv, activeCount } from "./import-test-book";

test("one match candidate links the row and several candidates need review", () => {
  const book = tempBook();
  try {
    createTransaction(book.db, {
      accountId: book.account.id,
      date: "2026-04-01",
      amount: -10000,
      payeeRaw: "RENT",
      lines: [{ amount: -10000 }],
      source: "ui",
      at,
    });
    const one = importCsv(book.db, book.account.id, "one.csv", ["04/02/2026,RENT PAYMENT,-10.00"]);
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
      amount: -25000,
      payeeRaw: "POWER",
      lines: [{ amount: -25000 }],
      source: "ui",
      at,
    });
    createTransaction(book.db, {
      accountId: book.account.id,
      date: "2026-05-03",
      amount: -25000,
      payeeRaw: "POWER EAST",
      lines: [{ amount: -25000 }],
      source: "ui",
      at,
    });
    const several = importCsv(book.db, book.account.id, "several.csv", ["05/02/2026,POWER BILL,-25.00"]);
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

test("undo removes only unedited rows", () => {
  const book = tempBook();
  try {
    createTransaction(book.db, {
      accountId: book.account.id,
      date: "2026-01-13",
      amount: -4000,
      payeeRaw: "MANUAL",
      lines: [{ amount: -4000 }],
      source: "ui",
      at,
    });
    const result = importCsv(book.db, book.account.id, "month.csv", [
      "01/20/2026,KEEP,-1.00",
      "01/21/2026,EDIT,-2.00",
      "01/13/2026,MANUAL MATCH,-4.00",
    ]);
    expect(result.kind).toBe("batch");
    if (result.kind !== "batch") {
      return;
    }
    expect(result.counts.created).toBe(2);
    expect(result.counts.matched).toBe(1);

    const rows = book.db.select().from(transactions).all();
    const edit = rows.find((row) => row.payeeRaw === "EDIT");
    const manual = rows.find((row) => row.payeeRaw === "MANUAL");
    if (!edit || !manual) {
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
      lines: current.lines.map((line) => ({ amount: line.amount, memo: "Changed after import", tagIds: line.tagIds })),
      source: "ui",
      at: "2026-10-08T16:00:00Z",
    });

    const undone = undoImportBatch(book.db, result.id, { source: "import", at: "2026-10-09T16:00:00Z" });
    expect(undone.blocked.map((row) => row.reason).sort()).toEqual(["edited"]);
    const after = book.db.select().from(transactions).all();
    expect(after.find((row) => row.payeeRaw === "KEEP")).toBeUndefined();
    expect(after.find((row) => row.payeeRaw === "EDIT")).toBeDefined();
    expect(after.find((row) => row.payeeRaw === "MANUAL")).toBeDefined();
    expect(after.find((row) => row.payeeRaw === "MANUAL")?.importRowId).toBeNull();
    expect(undone.batch.undoneAt).toBeNull();
  } finally {
    book.close();
  }
});

test("a later import matches a mirror and clears the mirror flag", () => {
  const book = tempBook();
  try {
    const savings = createAccount(book.db, {
      asOf: "2026-10-07",
      name: "Savings",
      institution: null,
      kind: "savings",
      openingDate: "2026-01-01",
      openingBalance: 0,
      source: "ui",
      at,
    });
    const payment = createTransaction(book.db, {
      accountId: book.account.id,
      date: "2026-01-02",
      amount: -5000,
      payeeRaw: "Visa payment",
      lines: [{ amount: -5000, transferAccountId: savings.id }],
      source: "ui",
      at,
    });
    const mirrorId = payment.transferPeerId;
    if (!mirrorId) {
      throw new Error("Mirror is missing");
    }
    expect(getTransaction(book.db, mirrorId)?.mirror).toBe(true);
    const result = importCsv(book.db, savings.id, "savings.csv", ["01/02/2026,CARD PAYMENT,5.00"]);
    expect(result.kind).toBe("batch");
    if (result.kind !== "batch") {
      return;
    }
    expect(result.counts.matched).toBe(1);
    expect(result.counts.created).toBe(0);
    const matched = getTransaction(book.db, mirrorId);
    expect(matched?.mirror).toBe(false);
    expect(matched?.importRowId).not.toBeNull();
    expect(matched).not.toBeNull();
    expect(activeCount(book.db)).toBe(2);
  } finally {
    book.close();
  }
});

test("a transfer suggestion at import does not create a transfer", () => {
  const book = tempBook();
  try {
    const visa = createAccount(book.db, {
      asOf: "2026-10-07",
      name: "Visa",
      institution: null,
      kind: "savings",
      openingDate: "2026-01-01",
      openingBalance: 0,
      source: "ui",
      at,
    });
    const result = importCsv(book.db, book.account.id, "chequing.csv", ["01/05/2026,VISA PAYMENT,-8.00"]);
    expect(result.kind).toBe("batch");
    expect(activeCount(book.db)).toBe(1);
    const row = book.db.select().from(transactions).all()[0];
    if (!row) {
      throw new Error("Imported row is missing");
    }
    const saved = getTransaction(book.db, row.id);
    expect(saved?.transferPeerId).toBeNull();
    expect(saved?.lines[0]?.transferAccountId).toBeNull();
    expect(book.db.select().from(transactions).where(eq(transactions.accountId, visa.id)).all()).toHaveLength(0);
    expect(saved?.lines[0]?.categoryId).toBeNull();
  } finally {
    book.close();
  }
});
