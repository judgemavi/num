import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog, migrateDatabase, openDatabase, settings, transactionLines, transactions } from "@num/db";
import { columnMapSchema, type ColumnMap } from "@num/shared";
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createBucket, readBucket } from "./buckets";
import { createCategory } from "./categories";
import { fillBuckets } from "./funding-fill";
import { importStatement } from "./imports";
import { undoImportBatch } from "./import-undo";
import { linkOccurrence } from "./recurring-links";
import { createSchedule } from "./schedule-test-book";
import { acceptTransferPair } from "./suggestions";
import { createTransaction, deleteTransaction, getTransaction } from "./transactions";

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

function book() {
  const dir = mkdtempSync(join(tmpdir(), "num-delete-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "USD" }).run();
  return {
    db,
    sqlite,
    dir,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function assertLedger(sqlite: Database) {
  expect(sqlite.query("pragma foreign_key_check").all()).toEqual([]);
  const orphans = sqlite
    .query(
      `select t.id as id
       from transactions t
       join transaction_lines l on l.transaction_id = t.id
       where l.transfer_account_id is not null and t.transfer_peer_id is null`,
    )
    .all();
  expect(orphans).toEqual([]);
}

function paycheck(db: Db) {
  const cash = createAccount(db, {
    name: "Cash",
    kind: "chequing",
    openingDate: "2026-01-01",
    openingBalance: 500_000,
    ...saved,
  });
  const pay = createCategory(db, { name: "Pay", kind: "income", ...saved });
  const plan = createSchedule(db, {
    name: "Pay",
    kind: "income",
    accountId: cash.id,
    expectedAmount: 500_000,
    tolerance: 0,
    amountMode: "fixed",
    startDate: "2026-10-01",
    freq: "monthly",
    interval: 1,
    monthDay: 1,
    businessDayShift: "none",
    payday: true,
    ...saved,
  });
  const deposit = createTransaction(db, {
    accountId: cash.id,
    date: "2026-10-01",
    amount: 500_000,
    payeeRaw: "Payroll",
    lines: [{ amount: 500_000, categoryId: pay.id }],
    ...saved,
  });
  linkOccurrence(db, plan.id, "2026-10-01", deposit.id, saved);
  const food = createBucket(db, {
    name: "Food",
    kind: "spending",
    priority: 1,
    essential: false,
    color: "mint",
    icon: "shopping-cart",
    categoryIds: [],
    refillTo: 100_000,
    amount: null,
    dueDate: null,
    repeat: null,
    target: null,
    targetDate: null,
    fixedAmount: null,
    months: null,
    canRecede: null,
    schedule: null,
    asOf: "2026-10-01",
    ...saved,
  });
  return { cash, deposit, food };
}

test("delete of a paycheck does not change the funding of the buckets", () => {
  const sample = book();
  try {
    const { deposit, food } = paycheck(sample.db);
    fillBuckets(sample.db, { asOf: "2026-10-02", ...saved });
    expect(readBucket(sample.db, food.id).balance).toBe(100_000);
    deleteTransaction(sample.db, deposit.id, saved);
    expect(getTransaction(sample.db, deposit.id)).toBeNull();
    expect(readBucket(sample.db, food.id).balance).toBe(100_000);
    assertLedger(sample.sqlite);
  } finally {
    sample.close();
  }
});

test("import undo skips a row the user linked as a transfer", () => {
  const sample = book();
  try {
    const cash = createAccount(sample.db, {
      name: "Cash",
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const savings = createAccount(sample.db, {
      name: "Savings",
      kind: "savings",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const imported = importStatement(sample.db, sample.dir, {
      source: "import",
      at,
      accountId: cash.id,
      filename: "pay.csv",
      mimeType: "text/csv",
      bytes: new TextEncoder().encode("date,description,amount\n01/02/2026,CARD PAYMENT,-8.00\n"),
      columnMap: map,
    });
    if (imported.kind !== "batch") {
      throw new Error("Import did not create a batch");
    }
    const payment = sample.db.select().from(transactions).where(eq(transactions.payeeRaw, "CARD PAYMENT")).get();
    if (!payment) {
      throw new Error("Imported row is missing");
    }
    const other = createTransaction(sample.db, {
      accountId: savings.id,
      date: "2026-01-02",
      amount: 8000,
      payeeRaw: "From cash",
      lines: [{ amount: 8000 }],
      ...saved,
    });
    acceptTransferPair(sample.db, "2026-01-02", payment.id, other.id, saved);
    const undone = undoImportBatch(sample.db, imported.id, { source: "import", at });
    expect(undone.blocked.map((row) => row.reason)).toEqual(["edited"]);
    expect(getTransaction(sample.db, payment.id)?.transferPeerId).toBe(other.id);
    assertLedger(sample.sqlite);
  } finally {
    sample.close();
  }
});

test("undo of a row with a refund pointing at it clears the link", () => {
  const sample = book();
  try {
    const cash = createAccount(sample.db, {
      name: "Cash",
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const groceries = createCategory(sample.db, { name: "Groceries", kind: "expense", ...saved });
    const imported = importStatement(sample.db, sample.dir, {
      source: "import",
      at,
      accountId: cash.id,
      filename: "shop.csv",
      mimeType: "text/csv",
      bytes: new TextEncoder().encode("date,description,amount\n01/02/2026,NORTH MARKET,-12.00\n"),
      columnMap: map,
    });
    if (imported.kind !== "batch") {
      throw new Error("Import did not create a batch");
    }
    const purchase = sample.db.select().from(transactions).where(eq(transactions.payeeRaw, "NORTH MARKET")).get();
    if (!purchase) {
      throw new Error("Imported row is missing");
    }
    sample.db
      .update(transactionLines)
      .set({ categoryId: groceries.id })
      .where(eq(transactionLines.transactionId, purchase.id))
      .run();
    const refund = createTransaction(sample.db, {
      accountId: cash.id,
      date: "2026-01-05",
      amount: 4000,
      payeeRaw: "NORTH MARKET",
      lines: [{ amount: 4000, categoryId: groceries.id }],
      refundOfId: purchase.id,
      ...saved,
    });
    undoImportBatch(sample.db, imported.id, { source: "import", at });
    expect(getTransaction(sample.db, purchase.id)).toBeNull();
    expect(getTransaction(sample.db, refund.id)?.refundOfId).toBeNull();
    const cleared = sample.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, refund.id))
      .all()
      .find((row) => row.action === "update");
    expect(cleared).toBeDefined();
    expect(JSON.parse(cleared?.after ?? "{}")).toMatchObject({ refundOfId: null });
    assertLedger(sample.sqlite);
  } finally {
    sample.close();
  }
});

test("delete of a transfer removes the mirror and leaves no orphan transfer line", () => {
  const sample = book();
  try {
    const cash = createAccount(sample.db, {
      name: "Cash",
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const savings = createAccount(sample.db, {
      name: "Savings",
      kind: "savings",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const payment = createTransaction(sample.db, {
      accountId: cash.id,
      date: "2026-04-01",
      amount: -5000,
      payeeRaw: "Move",
      lines: [{ amount: -5000, transferAccountId: savings.id }],
      ...saved,
    });
    const mirrorId = payment.transferPeerId;
    if (!mirrorId) {
      throw new Error("Mirror is missing");
    }
    deleteTransaction(sample.db, payment.id, saved);
    expect(getTransaction(sample.db, payment.id)).toBeNull();
    expect(getTransaction(sample.db, mirrorId)).toBeNull();
    assertLedger(sample.sqlite);
  } finally {
    sample.close();
  }
});
