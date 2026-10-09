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
import { importStatement } from "./imports";
import { listInbox } from "./inbox";
import { createMerchant } from "./merchants";
import { createTransaction, getTransaction, updateTransaction } from "./transactions";

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
  return db.select().from(transactions).all().filter((row) => row.mirror === false);
}

function lineCategory(db: Db, id: string): string | null {
  return db.select().from(transactionLines).where(eq(transactionLines.transactionId, id)).all()[0]?.categoryId ?? null;
}

test("the first confirmation labels the payee's other rows and the next import", () => {
  const sample = book();
  try {
    const food = createCategory(sample.db, { name: "Groceries", kind: "expense", ...saved });
    const shop = createMerchant(sample.db, { name: "North Cafe", ...saved });
    const imported = importCsv(sample.db, sample.dir, sample.account.id, "a.csv", [
      "03/01/2026,NORTH CAFE,-4.00",
      "03/02/2026,NORTH CAFE,-5.00",
      "03/03/2026,NORTH CAFE,-6.00",
    ]);
    expect(imported.kind).toBe("batch");
    const open = rows(sample.db).sort((left, right) => (left.date < right.date ? -1 : 1));
    expect(open).toHaveLength(3);
    expect(open.every((row) => row.autoReason === null && lineCategory(sample.db, row.id) === null)).toBe(true);
    const first = open[0];
    if (!first) {
      throw new Error("Import is missing");
    }
    updateTransaction(sample.db, first.id, {
      accountId: first.accountId,
      date: first.date,
      amount: first.amount,
      payeeRaw: first.payeeRaw,
      merchantId: shop.id,
      notes: null,
      status: "open",
      lines: [{ amount: first.amount, categoryId: food.id, memo: null, transferAccountId: null, tagIds: [] }],
      ...saved,
    });
    for (const row of open.slice(1)) {
      const savedRow = getTransaction(sample.db, row.id);
      expect(savedRow?.autoReason).toBeNull();
      expect(savedRow?.lines[0]?.categoryId).toBeNull();
      expect(savedRow?.amount).toBe(row.amount);
    }
    const next = importCsv(sample.db, sample.dir, sample.account.id, "b.csv", ["03/12/2026,NORTH CAFE,-4.00"]);
    expect(next.kind).toBe("batch");
    const latest = rows(sample.db).find((row) => row.date === "2026-03-12");
    expect(latest?.autoReason).toBe("learned_amount");
    expect(latest?.autoSourceId).toBe(first.id);
    expect(latest?.merchantId).toBe(shop.id);
    expect(lineCategory(sample.db, latest?.id ?? "")).toBe(food.id);
  } finally {
    sample.close();
  }
});

test("a transfer and a split are never labeled automatically", () => {
  const sample = book();
  try {
    const food = createCategory(sample.db, { name: "Groceries", kind: "expense", ...saved });
    const visa = createAccount(sample.db, {
      name: "Visa",
      institution: null,
      kind: "savings",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const plain = createTransaction(sample.db, {
      accountId: sample.account.id,
      date: "2026-03-01",
      amount: -400,
      payeeRaw: "NORTH CAFE",
      status: "open",
      lines: [{ amount: -400 }],
      ...saved,
    });
    const split = createTransaction(sample.db, {
      accountId: sample.account.id,
      date: "2026-03-02",
      amount: -400,
      payeeRaw: "NORTH CAFE",
      status: "open",
      lines: [
        { amount: -250, memo: null, tagIds: [] },
        { amount: -150, categoryId: food.id, memo: null, tagIds: [] },
      ],
      ...saved,
    });
    const transfer = createTransaction(sample.db, {
      accountId: sample.account.id,
      date: "2026-03-03",
      amount: -400,
      payeeRaw: "NORTH CAFE",
      status: "open",
      lines: [{ amount: -400, transferAccountId: visa.id, memo: null, tagIds: [] }],
      ...saved,
    });
    updateTransaction(sample.db, plain.id, {
      accountId: plain.accountId,
      date: plain.date,
      amount: plain.amount,
      payeeRaw: plain.payeeRaw,
      merchantId: null,
      notes: null,
      status: "open",
      lines: [{ amount: plain.amount, categoryId: food.id, memo: null, transferAccountId: null, tagIds: [] }],
      ...saved,
    });
    const splitSaved = getTransaction(sample.db, split.id);
    expect(splitSaved?.autoReason).toBeNull();
    expect(splitSaved?.lines.map((line) => line.categoryId)).toEqual([null, food.id]);
    const transferSaved = getTransaction(sample.db, transfer.id);
    expect(transferSaved?.autoReason).toBeNull();
    expect(transferSaved?.lines[0]?.transferAccountId).toBe(visa.id);
    expect(transferSaved?.amount).toBe(-400);
    const imported = importCsv(sample.db, sample.dir, sample.account.id, "visa.csv", ["03/04/2026,VISA PAYMENT,-8.00"]);
    expect(imported.kind).toBe("batch");
    const visaRow = rows(sample.db).find((row) => row.payeeRaw === "VISA PAYMENT");
    expect(visaRow?.autoReason).toBeNull();
    expect(lineCategory(sample.db, visaRow?.id ?? "")).toBeNull();
    expect(getTransaction(sample.db, visaRow?.id ?? "")?.lines[0]?.transferAccountId).toBeNull();
    expect(rows(sample.db).filter((row) => row.payeeRaw === "VISA PAYMENT")).toHaveLength(1);
  } finally {
    sample.close();
  }
});

test("a disagreeing confirmation stops automatic labels", () => {
  const sample = book();
  try {
    const coffee = createCategory(sample.db, { name: "Coffee", kind: "expense", ...saved });
    const groceries = createCategory(sample.db, { name: "Groceries", kind: "expense", ...saved });
    for (let day = 1; day <= 4; day += 1) {
      createTransaction(sample.db, {
        accountId: sample.account.id,
        date: `2026-03-0${day}`,
        amount: -400,
        payeeRaw: "NORTH CAFE",
        status: "open",
        lines: [{ amount: -400, categoryId: coffee.id, memo: null, tagIds: [] }],
        ...saved,
      });
    }
    const open = createTransaction(sample.db, {
      accountId: sample.account.id,
      date: "2026-03-10",
      amount: -500,
      payeeRaw: "NORTH CAFE",
      status: "open",
      lines: [{ amount: -500 }],
      ...saved,
    });
    const other = createTransaction(sample.db, {
      accountId: sample.account.id,
      date: "2026-03-11",
      amount: -600,
      payeeRaw: "NORTH CAFE",
      status: "open",
      lines: [{ amount: -600, categoryId: groceries.id, memo: null, tagIds: [] }],
      ...saved,
    });
    expect(getTransaction(sample.db, open.id)?.autoReason).toBeNull();
    expect(lineCategory(sample.db, open.id)).toBeNull();
    const item = listInbox(sample.db, asOf).items.find((row) => row.kind === "uncategorized" && row.transactionId === open.id);
    expect(item?.kind).toBe("uncategorized");
    if (item?.kind === "uncategorized") {
      expect(item.suggestion.reason).toBe("none");
      expect(item.suggestion.categoryId).toBeNull();
    }
    expect(other.autoReason).toBeNull();
  } finally {
    sample.close();
  }
});

test("a correction clears the automatic reason and counts as a confirmation", () => {
  const sample = book();
  try {
    const coffee = createCategory(sample.db, { name: "Coffee", kind: "expense", ...saved });
    const groceries = createCategory(sample.db, { name: "Groceries", kind: "expense", ...saved });
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
      lines: [{ amount: first.amount, categoryId: coffee.id, memo: null, transferAccountId: null, tagIds: [] }],
      ...saved,
    });
    expect(getTransaction(sample.db, second.id)?.autoReason).toBe("learned_amount");
    updateTransaction(sample.db, second.id, {
      accountId: second.accountId,
      date: second.date,
      amount: second.amount,
      payeeRaw: second.payeeRaw,
      merchantId: null,
      notes: null,
      status: "open",
      lines: [{ amount: second.amount, categoryId: groceries.id, memo: null, transferAccountId: null, tagIds: [] }],
      ...saved,
    });
    const corrected = getTransaction(sample.db, second.id);
    expect(corrected?.autoReason).toBeNull();
    expect(corrected?.autoSourceId).toBeNull();
    expect(corrected?.lines[0]?.categoryId).toBe(groceries.id);
    const imported = importCsv(sample.db, sample.dir, sample.account.id, "d.csv", ["03/12/2026,NORTH CAFE,-7.00"]);
    expect(imported.kind).toBe("batch");
    const latest = rows(sample.db).find((row) => row.date === "2026-03-12");
    expect(latest?.autoReason).toBeNull();
    expect(lineCategory(sample.db, latest?.id ?? "")).toBeNull();
  } finally {
    sample.close();
  }
});
