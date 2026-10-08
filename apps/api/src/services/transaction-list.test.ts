import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { merchants, migrateDatabase, openDatabase } from "@num/db";
import type { TransactionListQuery } from "@num/shared";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { createTag } from "./tags";
import { listTransactions } from "./transaction-list";
import { createTransaction, deleteTransaction } from "./transactions";

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-transaction-list-"));
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

const saved = { source: "ui" as const, at: "2026-10-07T16:00:00Z" };

const page: TransactionListQuery = { page: 1, pageSize: 50, uncategorized: false, automatic: false };

function book() {
  const handle = tempDatabase();
  const db = handle.db;
  const chequing = createAccount(db, {
    name: "Everyday",
    kind: "chequing",
    openingDate: "2026-01-01",
    openingBalance: 1000,
    ...saved,
  });
  const savings = createAccount(db, {
    name: "Reserve",
    kind: "savings",
    openingDate: "2026-01-01",
    openingBalance: 500,
    ...saved,
  });
  const food = createCategory(db, { name: "Food", kind: "expense", ...saved });
  const trip = createTag(db, { name: "Trip", ...saved });
  const merchantId = crypto.randomUUID();
  db.insert(merchants)
    .values({ id: merchantId, name: "Blue Harbor", defaultCategoryId: null, archivedAt: null })
    .run();
  return { ...handle, db, chequing, savings, food, trip, merchantId };
}

function add(
  db: Db,
  input: {
    accountId: string;
    date: string;
    amount: number;
    payeeRaw: string;
    notes?: string;
    merchantId?: string;
    categoryId?: string;
    transferAccountId?: string;
    tagIds?: string[];
  },
) {
  return createTransaction(db, {
    accountId: input.accountId,
    date: input.date,
    amount: input.amount,
    payeeRaw: input.payeeRaw,
    notes: input.notes,
    merchantId: input.merchantId,
    status: "open",
    lines: [
      {
        amount: input.amount,
        categoryId: input.categoryId,
        transferAccountId: input.transferAccountId,
        tagIds: input.tagIds,
      },
    ],
    ...saved,
  });
}

test("filters match account, category, merchant, tag, date, text and uncategorized lines", () => {
  const fixture = book();
  try {
    const food = add(fixture.db, {
      accountId: fixture.chequing.id,
      date: "2026-02-01",
      amount: -200,
      payeeRaw: "North Market",
      notes: "winter apples",
      merchantId: fixture.merchantId,
      categoryId: fixture.food.id,
      tagIds: [fixture.trip.id],
    });
    const plain = add(fixture.db, {
      accountId: fixture.chequing.id,
      date: "2026-03-01",
      amount: -50,
      payeeRaw: "Corner stand",
    });
    const interest = add(fixture.db, {
      accountId: fixture.savings.id,
      date: "2026-05-01",
      amount: 80,
      payeeRaw: "Interest",
    });
    const transfer = add(fixture.db, {
      accountId: fixture.chequing.id,
      date: "2026-04-01",
      amount: -25,
      payeeRaw: "Move",
      transferAccountId: fixture.savings.id,
    });
    const mixed = createTransaction(fixture.db, {
      accountId: fixture.chequing.id,
      date: "2026-04-02",
      amount: -50,
      payeeRaw: "Split shop",
      status: "open",
      lines: [
        { amount: -30, categoryId: fixture.food.id },
        { amount: -20 },
      ],
      ...saved,
    });

    expect(listTransactions(fixture.db, { ...page, accountId: fixture.chequing.id }).items.map((item) => item.id)).toEqual([
      mixed.id,
      transfer.id,
      plain.id,
      food.id,
    ]);
    expect(listTransactions(fixture.db, { ...page, categoryId: fixture.food.id }).items.map((item) => item.payeeRaw)).toEqual([
      "Split shop",
      "North Market",
    ]);
    expect(listTransactions(fixture.db, { ...page, merchantId: fixture.merchantId }).items.map((item) => item.id)).toEqual([
      food.id,
    ]);
    expect(listTransactions(fixture.db, { ...page, tagId: fixture.trip.id }).items.map((item) => item.id)).toEqual([
      food.id,
    ]);
    expect(listTransactions(fixture.db, { ...page, from: "2026-02-01", to: "2026-02-01" }).items.map((item) => item.id)).toEqual([
      food.id,
    ]);
    expect(listTransactions(fixture.db, { ...page, q: "APPLES" }).items.map((item) => item.id)).toEqual([food.id]);
    expect(listTransactions(fixture.db, { ...page, q: "north" }).items.map((item) => item.id)).toEqual([food.id]);
    expect(listTransactions(fixture.db, { ...page, q: "harbor" }).items.map((item) => item.id)).toEqual([food.id]);
    expect(listTransactions(fixture.db, { ...page, q: "missing" }).total).toBe(0);

    const uncategorized = listTransactions(fixture.db, { ...page, uncategorized: true });
    expect(uncategorized.items.map((item) => item.id).sort()).toEqual([plain.id, interest.id, mixed.id].sort());
    expect(uncategorized.items.find((item) => item.id === food.id)).toBeUndefined();
    expect(uncategorized.items.find((item) => item.id === transfer.id)).toBeUndefined();
  } finally {
    fixture.close();
  }
});

test("a deleted transaction is excluded and a later page can be empty", () => {
  const fixture = book();
  try {
    const first = add(fixture.db, {
      accountId: fixture.chequing.id,
      date: "2026-01-02",
      amount: -10,
      payeeRaw: "One",
    });
    const second = add(fixture.db, {
      accountId: fixture.chequing.id,
      date: "2026-01-03",
      amount: -20,
      payeeRaw: "Two",
    });
    deleteTransaction(fixture.db, first.id, saved);
    const listed = listTransactions(fixture.db, page);
    expect(listed.total).toBe(1);
    expect(listed.items.map((item) => item.id)).toEqual([second.id]);
    const past = listTransactions(fixture.db, { ...page, page: 3, pageSize: 1 });
    expect(past.items).toEqual([]);
    expect(past.total).toBe(1);
  } finally {
    fixture.close();
  }
});

test("sort follows the column and keeps id as the tie break", () => {
  const fixture = book();
  try {
    add(fixture.db, { accountId: fixture.chequing.id, date: "2026-05-01", amount: -5, payeeRaw: "B" });
    add(fixture.db, { accountId: fixture.chequing.id, date: "2026-05-01", amount: -5, payeeRaw: "A" });
    const byPayee = listTransactions(fixture.db, { ...page, sort: "payeeRaw", dir: "asc" });
    expect(byPayee.items.map((item) => item.payeeRaw)).toEqual(["A", "B"]);
    const byAmount = listTransactions(fixture.db, { ...page, sort: "amount", dir: "desc" });
    expect(byAmount.items.every((item) => item.amount === -5)).toBe(true);
    const ids = [...byAmount.items.map((item) => item.id)].sort();
    expect(byAmount.items.map((item) => item.id)).toEqual([...ids].reverse());
  } finally {
    fixture.close();
  }
});

test("running balance includes the opening balance and ignores other accounts and filters", () => {
  const fixture = book();
  try {
    const early = add(fixture.db, {
      accountId: fixture.chequing.id,
      date: "2026-01-10",
      amount: 100,
      payeeRaw: "Deposit",
      categoryId: fixture.food.id,
    });
    const later = add(fixture.db, {
      accountId: fixture.chequing.id,
      date: "2026-01-10",
      amount: -40,
      payeeRaw: "Snack",
    });
    const removed = add(fixture.db, {
      accountId: fixture.chequing.id,
      date: "2026-01-11",
      amount: -15,
      payeeRaw: "Void",
    });
    add(fixture.db, {
      accountId: fixture.savings.id,
      date: "2026-01-09",
      amount: 999,
      payeeRaw: "Other",
    });
    deleteTransaction(fixture.db, removed.id, saved);

    const ordered = [early, later].sort((left, right) => (left.id < right.id ? -1 : 1));
    const expected = new Map<string, number>();
    let balance = 1000;
    for (const row of ordered) {
      balance += row.amount;
      expected.set(row.id, balance);
    }

    const all = listTransactions(fixture.db, { ...page, accountId: fixture.chequing.id });
    expect(all.total).toBe(2);
    for (const item of all.items) {
      const balance = expected.get(item.id);
      if (balance === undefined) {
        throw new Error("Missing balance");
      }
      expect(item.runningBalance).toBe(balance);
    }

    const filtered = listTransactions(fixture.db, {
      ...page,
      accountId: fixture.chequing.id,
      categoryId: fixture.food.id,
    });
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]?.id).toBe(early.id);
    expect(filtered.items[0]?.runningBalance).toBe(expected.get(early.id) ?? null);

    const unscoped = listTransactions(fixture.db, page);
    expect(unscoped.items.every((item) => item.runningBalance === null)).toBe(true);

    const savings = listTransactions(fixture.db, { ...page, accountId: fixture.savings.id });
    expect(savings.items.map((item) => item.runningBalance)).toEqual([1499]);
  } finally {
    fixture.close();
  }
});

test("running balance is null for an investment account and present for a chequing account", () => {
  const fixture = book();
  try {
    const investment = createAccount(fixture.db, {
      name: "Fund",
      kind: "investment",
      openingDate: "2026-01-01",
      openingBalance: 5000,
      ...saved,
    });
    add(fixture.db, {
      accountId: investment.id,
      date: "2026-02-01",
      amount: 200,
      payeeRaw: "Buy units",
    });
    add(fixture.db, {
      accountId: fixture.chequing.id,
      date: "2026-02-01",
      amount: -10,
      payeeRaw: "Fee",
    });

    const valued = listTransactions(fixture.db, { ...page, accountId: investment.id });
    expect(valued.items).toHaveLength(1);
    expect(valued.items[0]?.runningBalance).toBeNull();

    const cash = listTransactions(fixture.db, { ...page, accountId: fixture.chequing.id });
    expect(cash.items).toHaveLength(1);
    expect(cash.items[0]?.runningBalance).toBe(990);
  } finally {
    fixture.close();
  }
});
