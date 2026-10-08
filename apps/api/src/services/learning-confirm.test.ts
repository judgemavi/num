import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings, transactionLines, transactions } from "@num/db";
import { columnMapSchema, type ColumnMap } from "@num/shared";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { undoImportBatch } from "./import-undo";
import { importStatement } from "./imports";
import { listInbox } from "./inbox";
import { createMerchant } from "./merchants";
import { createRule } from "./rules";
import { acceptTransferPair } from "./suggestions";
import { acceptLooksRight, createTransaction, getTransaction, updateTransaction } from "./transactions";

const at = "2026-10-08T16:00:00.000Z";
const saved = { source: "ui" as const, at };
const asOf = "2026-04-01";

const map: ColumnMap = columnMapSchema.parse({
  hasHeader: true,
  date: 0,
  description: 1,
  amount: 2,
  dateOrder: "mdy",
  signConvention: "account",
  decimalSeparator: ".",
});

function book() {
  const dir = mkdtempSync(join(tmpdir(), "num-learn-"));
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
    ...saved,
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

function importCsv(db: Db, dir: string, accountId: string, filename: string, lines: string[]) {
  return importStatement(db, dir, {
    source: "import",
    at,
    accountId,
    filename,
    mimeType: "text/csv",
    bytes: new TextEncoder().encode(["date,description,amount", ...lines].join("\n")),
    columnMap: map,
  });
}

function rows(db: Db) {
  return db.select().from(transactions).all().filter((row) => row.deletedAt === null && row.mirror === false);
}

function lineCategory(db: Db, id: string): string | null {
  return db.select().from(transactionLines).where(eq(transactionLines.transactionId, id)).all()[0]?.categoryId ?? null;
}

test("accepting a transfer pair clears the automatic reason", () => {
  const sample = book();
  try {
    const other = createAccount(sample.db, {
      name: "Savings",
      institution: null,
      kind: "savings",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const left = createTransaction(sample.db, {
      accountId: sample.account.id,
      date: "2026-03-01",
      amount: -2_000,
      payeeRaw: "MOVE",
      status: "open",
      lines: [{ amount: -2_000 }],
      ...saved,
    });
    const right = createTransaction(sample.db, {
      accountId: other.id,
      date: "2026-03-02",
      amount: 2_000,
      payeeRaw: "MOVE",
      status: "open",
      lines: [{ amount: 2_000 }],
      ...saved,
    });
    sample.db
      .update(transactions)
      .set({ source: "import", autoReason: "learned", autoSourceId: left.id })
      .where(eq(transactions.id, left.id))
      .run();
    sample.db
      .update(transactions)
      .set({ autoReason: "learned", autoSourceId: left.id })
      .where(eq(transactions.id, right.id))
      .run();
    acceptTransferPair(sample.db, asOf, left.id, right.id, saved);
    expect(getTransaction(sample.db, left.id)?.autoReason).toBeNull();
    expect(getTransaction(sample.db, left.id)?.autoSourceId).toBeNull();
    expect(getTransaction(sample.db, right.id)?.autoReason).toBeNull();
    expect(getTransaction(sample.db, right.id)?.autoSourceId).toBeNull();
    expect(getTransaction(sample.db, left.id)?.lines[0]?.transferAccountId).toBe(other.id);
  } finally {
    sample.close();
  }
});

test("an automatic label keeps a merchant the user set", () => {
  const sample = book();
  try {
    const food = createCategory(sample.db, { name: "Groceries", kind: "expense", ...saved });
    const shop = createMerchant(sample.db, { name: "North Cafe", ...saved });
    const chosen = createTransaction(sample.db, {
      accountId: sample.account.id,
      date: "2026-03-02",
      amount: -500,
      payeeRaw: "NORTH CAFE",
      merchantId: shop.id,
      status: "open",
      lines: [{ amount: -500 }],
      ...saved,
    });
    const first = createTransaction(sample.db, {
      accountId: sample.account.id,
      date: "2026-03-01",
      amount: -400,
      payeeRaw: "NORTH CAFE",
      status: "open",
      lines: [{ amount: -400 }],
      ...saved,
    });
    updateTransaction(sample.db, first.id, {
      accountId: first.accountId,
      date: first.date,
      amount: first.amount,
      payeeRaw: first.payeeRaw,
      merchantId: null,
      notes: null,
      status: "open",
      lines: [{ amount: first.amount, categoryId: food.id, memo: null, transferAccountId: null, tagIds: [] }],
      ...saved,
    });
    const labeled = getTransaction(sample.db, chosen.id);
    expect(labeled?.merchantId).toBe(shop.id);
    expect(labeled?.lines[0]?.categoryId).toBe(food.id);
    expect(labeled?.autoReason).toBe("learned");
  } finally {
    sample.close();
  }
});

test("a notes edit is not a confirmation and Looks right is", () => {
  const sample = book();
  try {
    const food = createCategory(sample.db, { name: "Groceries", kind: "expense", ...saved });
    const first = createTransaction(sample.db, {
      accountId: sample.account.id,
      date: "2026-03-01",
      amount: -400,
      payeeRaw: "NORTH CAFE",
      status: "open",
      lines: [{ amount: -400 }],
      ...saved,
    });
    const second = createTransaction(sample.db, {
      accountId: sample.account.id,
      date: "2026-03-02",
      amount: -500,
      payeeRaw: "NORTH CAFE",
      status: "open",
      lines: [{ amount: -500 }],
      ...saved,
    });
    updateTransaction(sample.db, first.id, {
      accountId: first.accountId,
      date: first.date,
      amount: first.amount,
      payeeRaw: first.payeeRaw,
      merchantId: null,
      notes: null,
      status: "open",
      lines: [{ amount: first.amount, categoryId: food.id, memo: null, transferAccountId: null, tagIds: [] }],
      ...saved,
    });
    const third = createTransaction(sample.db, {
      accountId: sample.account.id,
      date: "2026-03-03",
      amount: -600,
      payeeRaw: "NORTH CAFE",
      status: "open",
      lines: [{ amount: -600 }],
      ...saved,
    });
    updateTransaction(sample.db, second.id, {
      accountId: second.accountId,
      date: second.date,
      amount: second.amount,
      payeeRaw: second.payeeRaw,
      merchantId: null,
      notes: "A note",
      status: "open",
      lines: [{ amount: second.amount, categoryId: food.id, memo: null, transferAccountId: null, tagIds: [] }],
      ...saved,
    });
    expect(getTransaction(sample.db, second.id)?.autoReason).toBe("learned");
    expect(getTransaction(sample.db, second.id)?.notes).toBe("A note");
    expect(lineCategory(sample.db, third.id)).toBeNull();
    acceptLooksRight(sample.db, second.id, saved);
    expect(getTransaction(sample.db, second.id)?.autoReason).toBeNull();
    expect(lineCategory(sample.db, third.id)).toBe(food.id);
    expect(getTransaction(sample.db, third.id)?.autoReason).toBe("learned");
    expect(getTransaction(sample.db, third.id)?.autoSourceId).toBe(second.id);
  } finally {
    sample.close();
  }
});

test("an import labels only its own rows and undo removes those labels", () => {
  const sample = book();
  try {
    const food = createCategory(sample.db, { name: "Groceries", kind: "expense", ...saved });
    const older = createTransaction(sample.db, {
      accountId: sample.account.id,
      date: "2026-02-01",
      amount: -300,
      payeeRaw: "NORTH CAFE",
      status: "open",
      lines: [{ amount: -300 }],
      ...saved,
    });
    createRule(sample.db, {
      match: "exact",
      pattern: "NORTH CAFE",
      categoryId: food.id,
      priority: 1,
      ...saved,
    });
    const imported = importCsv(sample.db, sample.dir, sample.account.id, "rule.csv", ["03/12/2026,NORTH CAFE,-4.00"]);
    expect(imported.kind).toBe("batch");
    if (imported.kind !== "batch") {
      return;
    }
    expect(lineCategory(sample.db, older.id)).toBeNull();
    expect(getTransaction(sample.db, older.id)?.autoReason).toBeNull();
    const created = rows(sample.db).find((row) => row.date === "2026-03-12");
    expect(created?.autoReason).toBe("rule");
    expect(lineCategory(sample.db, created?.id ?? "")).toBe(food.id);
    undoImportBatch(sample.db, imported.id, saved);
    expect(rows(sample.db).some((row) => row.id === created?.id)).toBe(false);
    expect(lineCategory(sample.db, older.id)).toBeNull();
  } finally {
    sample.close();
  }
});

test("a conflict suggests the most recent confirmation and does not label", () => {
  const sample = book();
  try {
    const coffee = createCategory(sample.db, { name: "Coffee", kind: "expense", ...saved });
    const groceries = createCategory(sample.db, { name: "Groceries", kind: "expense", ...saved });
    createTransaction(sample.db, {
      accountId: sample.account.id,
      date: "2026-03-01",
      amount: -400,
      payeeRaw: "NORTH CAFE",
      status: "open",
      lines: [{ amount: -400, categoryId: coffee.id }],
      ...saved,
    });
    createTransaction(sample.db, {
      accountId: sample.account.id,
      date: "2026-03-10",
      amount: -400,
      payeeRaw: "NORTH CAFE",
      status: "open",
      lines: [{ amount: -400, categoryId: groceries.id }],
      ...saved,
    });
    const open = createTransaction(sample.db, {
      accountId: sample.account.id,
      date: "2026-03-11",
      amount: -500,
      payeeRaw: "NORTH CAFE",
      status: "open",
      lines: [{ amount: -500 }],
      ...saved,
    });
    expect(getTransaction(sample.db, open.id)?.autoReason).toBeNull();
    expect(lineCategory(sample.db, open.id)).toBeNull();
    const item = listInbox(sample.db, asOf).items.find((row) => row.kind === "uncategorized" && row.transactionId === open.id);
    expect(item?.kind).toBe("uncategorized");
    if (item?.kind === "uncategorized") {
      expect(item.suggestion.sure).toBe(false);
      expect(item.suggestion.reason).toBe("payee_history");
      expect(item.suggestion.categoryId).toBe(groceries.id);
    }
  } finally {
    sample.close();
  }
});
