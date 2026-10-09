import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog, migrateDatabase, monthCloses, openDatabase } from "@num/db";
import { type ErrorCode } from "@num/shared";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../db";
import { ServiceError } from "../service-error";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { createCheckpoint } from "./checkpoints";
import { closeMonth, listMonths, readMonth, reopenMonth } from "./months";
import { createTransaction } from "./transactions";

const at = "2026-04-02T16:00:00Z";
const saved = { source: "ui" as const, at };
const asOf = "2026-04-02";

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-months-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  return {
    db: createDb(sqlite),
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function expectCode(run: () => void, code: ErrorCode) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceError);
    expect((error as ServiceError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

function cash(db: Db, openingBalance = 10_000) {
  return createAccount(db, { name: "Cash", kind: "chequing", openingDate: "2026-01-01", openingBalance, ...saved });
}

function expense(db: Db, name: string) {
  return createCategory(db, { name, kind: "expense", ...saved });
}

function post(db: Db, accountId: string, date: string, amount: number, categoryId?: string) {
  return createTransaction(db, {
    accountId,
    date,
    amount,
    payeeRaw: "Example",
    status: "cleared",
    lines: [{ amount, categoryId }],
    ...saved,
  });
}

test("the stored story matches the raw sums when refunds reduce spending and transfers are excluded", () => {
  const book = tempDatabase();
  try {
    const account = cash(book.db, 20_000);
    const groceries = expense(book.db, "Groceries");
    const other = createAccount(book.db, {
      name: "Other",
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const pay = createCategory(book.db, { name: "Pay", kind: "income", ...saved });
    post(book.db, account.id, "2026-03-02", 10_000, pay.id);
    post(book.db, account.id, "2026-03-03", -4_000, groceries.id);
    post(book.db, account.id, "2026-03-04", 1_000, groceries.id);
    post(book.db, account.id, "2026-03-05", -200);
    createTransaction(book.db, {
      accountId: account.id,
      date: "2026-03-06",
      amount: -500,
      payeeRaw: "Move",
      status: "cleared",
      lines: [{ amount: -500, transferAccountId: other.id }],
      ...saved,
    });
    const rawExpense = [-4_000, 1_000];
    const detail = readMonth(book.db, "2026-03", asOf);
    expect(detail.story.income).toBe(10_000);
    expect(detail.story.spending).toBe(-rawExpense.reduce((sum, amount) => sum + amount, 0));
    expect(detail.story.spending).toBe(3_000);
    expect(detail.story.savingsRateMilliPct).toBe(70_000);
    expect(detail.story.uncategorized).toEqual({ count: 1, amount: -200 });
  } finally {
    book.close();
  }
});

test("category changes use the median of the previous 3 months", () => {
  const book = tempDatabase();
  try {
    const account = cash(book.db);
    const groceries = expense(book.db, "Groceries");
    const amounts = [100, 200, 300, 800];
    for (const [index, amount] of amounts.entries()) {
      const month = String(index + 1).padStart(2, "0");
      post(book.db, account.id, `2026-${month}-10`, -amount, groceries.id);
    }
    const detail = readMonth(book.db, "2026-04", "2026-04-30");
    expect(detail.story.increases).toEqual([
      { categoryId: groceries.id, amount: 800, median: 200, delta: 600 },
    ]);
    expect(detail.story.decreases).toEqual([]);
  } finally {
    book.close();
  }
});

test("a month cannot close on or before its last day", () => {
  const book = tempDatabase();
  try {
    const account = cash(book.db, 500);
    createCheckpoint(book.db, account.id, { date: "2026-03-31", statementBalance: 500, ...saved });
    const blocked = listMonths(book.db, "2026-03-31").items.find((item) => item.month === "2026-03");
    expect(blocked?.status).toBe("open");
    expect(blocked?.blockers.map((item) => item.code)).toEqual(["month_not_ended"]);
    expectCode(() => closeMonth(book.db, "2026-03", "2026-03-31", saved), "month_not_ended");
    expect(book.db.select().from(monthCloses).all()).toEqual([]);
    expect(closeMonth(book.db, "2026-03", "2026-04-01", saved).status).toBe("closed");
  } finally {
    book.close();
  }
});

test("a missing checkpoint blocks the close", () => {
  const book = tempDatabase();
  try {
    const account = cash(book.db, 1_000);
    const groceries = expense(book.db, "Groceries");
    post(book.db, account.id, "2026-03-10", -250, groceries.id);
    const blocked = listMonths(book.db, asOf).items.find((item) => item.month === "2026-03");
    expect(blocked?.status).toBe("open");
    expect(blocked?.blockers).toEqual([{ code: "checkpoint_missing", accountId: account.id }]);
    expectCode(() => closeMonth(book.db, "2026-03", asOf, saved), "month_not_ready");
    expect(book.db.select().from(monthCloses).all()).toEqual([]);

    createCheckpoint(book.db, account.id, { date: "2026-03-31", statementBalance: 750, ...saved });
    const closed = closeMonth(book.db, "2026-03", asOf, saved);
    expect(closed.status).toBe("closed");
    expect(closed.story.spending).toBe(250);
    const row = book.db.select().from(monthCloses).where(eq(monthCloses.month, "2026-03")).get();
    expect(row?.month).toBe("2026-03");
    expect(row?.closedAt).toBe(at);
    expect(listMonths(book.db, asOf).items.find((item) => item.month === "2026-03")?.status).toBe("closed");
  } finally {
    book.close();
  }
});

test("an unresolved Inbox item blocks the close", () => {
  const book = tempDatabase();
  try {
    const account = cash(book.db, 1_000);
    post(book.db, account.id, "2026-03-10", -40);
    createCheckpoint(book.db, account.id, { date: "2026-03-31", statementBalance: 960, ...saved });
    const ready = listMonths(book.db, asOf).items.find((item) => item.month === "2026-03");
    expect(ready?.blockers.map((item) => item.code)).toEqual(["inbox_open"]);
    expect(ready?.status).toBe("open");
    expectCode(() => closeMonth(book.db, "2026-03", asOf, saved), "month_not_ready");
    expect(book.db.select().from(monthCloses).all()).toEqual([]);
  } finally {
    book.close();
  }
});

test("reopen removes the reviewed mark and the audit log stores the removal", () => {
  const book = tempDatabase();
  try {
    const account = cash(book.db, 500);
    createCheckpoint(book.db, account.id, { date: "2026-03-31", statementBalance: 500, ...saved });
    closeMonth(book.db, "2026-03", asOf, saved);
    const opened = reopenMonth(book.db, "2026-03", asOf, saved);
    expect(opened.status).toBe("ready");
    expect(book.db.select().from(monthCloses).where(eq(monthCloses.month, "2026-03")).get()).toBeUndefined();
    const audit = book.db.select().from(auditLog).where(eq(auditLog.entity, "month_close")).all();
    const reopen = audit.find((item) => item.action === "reopen");
    expect(reopen?.after).toBeNull();
    expect(JSON.parse(reopen?.before ?? "{}")).toMatchObject({ month: "2026-03" });
  } finally {
    book.close();
  }
});
