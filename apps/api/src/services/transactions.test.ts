import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase } from "@num/db";
import type { AccountKind, ErrorCode, Transaction, TransactionCreate, TransactionLineInput } from "@num/shared";
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { ServiceError } from "../service-error";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { createTag } from "./tags";
import { createTransaction, deleteTransaction, getTransaction, updateTransaction } from "./transactions";

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-transactions-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  return {
    db: createDb(sqlite),
    sqlite,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const at = "2026-10-07T16:00:00Z";

const saved = { source: "ui" as const, at };

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

function account(db: Db, name: string, kind: AccountKind) {
  return createAccount(db, {
    name,
    kind,
    openingDate: "2026-01-01",
    openingBalance: 0,
    ...saved,
  });
}

function entry(
  accountId: string,
  amount: number,
  lines: TransactionLineInput[],
  date = "2026-03-01",
): TransactionCreate & typeof saved {
  return {
    accountId,
    date,
    amount,
    payeeRaw: "Example shop",
    status: "open",
    lines,
    ...saved,
  };
}

function countWrites(sqlite: Database, run: () => void): number {
  const original = sqlite.transaction.bind(sqlite);
  let count = 0;
  sqlite.transaction = ((fn: () => unknown) => {
    count += 1;
    return original(fn);
  }) as typeof sqlite.transaction;
  try {
    run();
  } finally {
    sqlite.transaction = original;
  }
  return count;
}

function requirePeer(db: Db, record: Transaction): Transaction {
  if (!record.transferPeerId) {
    throw new Error("Transfer peer is missing");
  }
  const peer = getTransaction(db, record.transferPeerId);
  if (!peer) {
    throw new Error("Transfer peer is missing");
  }
  return peer;
}

test("lines must sum to the transaction amount", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing");
    const created = createTransaction(
      book.db,
      entry(chequing.id, -100, [
        { amount: -60, memo: "Food" },
        { amount: -40, memo: "Taxi" },
      ]),
    );
    expect(created.amount).toBe(-100);
    expect(created.lines.map((line) => line.amount)).toEqual([-60, -40]);

    expectCode(
      () => createTransaction(book.db, entry(chequing.id, -100, [{ amount: -60 }])),
      "lines_sum_mismatch",
    );

    expectCode(
      () =>
        updateTransaction(book.db, created.id, entry(chequing.id, -100, [{ amount: -90 }, { amount: -5 }])),
      "lines_sum_mismatch",
    );
    expect(getTransaction(book.db, created.id)?.amount).toBe(-100);
    expect(getTransaction(book.db, created.id)?.lines.map((line) => line.amount)).toEqual([-60, -40]);
  } finally {
    book.close();
  }
});

test("edit and delete of a transfer update both sides in one database transaction", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing");
    const savings = account(book.db, "Savings", "savings");
    const tag = createTag(book.db, { name: "Trip", ...saved });
    let created: Transaction | undefined;
    expect(
      countWrites(book.sqlite, () => {
        created = createTransaction(
          book.db,
          entry(chequing.id, -5_000, [
            { amount: -5_000, transferAccountId: savings.id, tagIds: [tag.id] },
          ]),
        );
      }),
    ).toBe(1);
    if (!created) {
      throw new Error("Create did not return a transaction");
    }
    const payment: Transaction = created;
    const mirror = requirePeer(book.db, payment);
    expect(mirror.accountId).toBe(savings.id);
    expect(mirror.amount).toBe(5_000);
    expect(mirror.date).toBe(payment.date);
    expect(mirror.transferPeerId).toBe(payment.id);
    expect(mirror.lines).toHaveLength(1);
    expect(mirror.lines[0]?.transferAccountId).toBe(chequing.id);
    expect(mirror.lines[0]?.amount).toBe(5_000);
    expect(mirror.lines[0]?.tagIds).toEqual([tag.id]);
    expect(payment.lines[0]?.tagIds).toEqual([tag.id]);

    let edited: Transaction | undefined;
    expect(
      countWrites(book.sqlite, () => {
        edited = updateTransaction(
          book.db,
          payment.id,
          entry(
            chequing.id,
            -7_000,
            [{ amount: -7_000, transferAccountId: savings.id, tagIds: [tag.id] }],
            "2026-03-05",
          ),
        );
      }),
    ).toBe(1);
    if (!edited) {
      throw new Error("Update did not return a transaction");
    }
    const next: Transaction = edited;
    const nextMirror = requirePeer(book.db, next);
    expect(next.amount).toBe(-7_000);
    expect(next.date).toBe("2026-03-05");
    expect(nextMirror.amount).toBe(7_000);
    expect(nextMirror.date).toBe("2026-03-05");
    expect(nextMirror.lines).toHaveLength(1);
    expect(nextMirror.lines[0]?.amount).toBe(7_000);
    expect(nextMirror.lines[0]?.transferAccountId).toBe(chequing.id);

    expectCode(
      () => updateTransaction(book.db, payment.id, entry(chequing.id, -7_000, [{ amount: -1 }])),
      "lines_sum_mismatch",
    );
    expect(getTransaction(book.db, payment.id)?.amount).toBe(-7_000);
    expect(getTransaction(book.db, nextMirror.id)?.amount).toBe(7_000);

    expect(
      countWrites(book.sqlite, () => {
        deleteTransaction(book.db, payment.id, saved);
      }),
    ).toBe(1);
    expect(getTransaction(book.db, payment.id)?.deletedAt).toBe(at);
    expect(getTransaction(book.db, nextMirror.id)?.deletedAt).toBe(at);
    expect(getTransaction(book.db, nextMirror.id)?.transferPeerId).toBe(payment.id);
  } finally {
    book.close();
  }
});

test("a transfer to the same account is rejected", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "cash");
    expectCode(
      () => createTransaction(book.db, entry(cash.id, -20, [{ amount: -20, transferAccountId: cash.id }])),
      "transfer_same_account",
    );
    expect(book.sqlite.query("select count(*) as count from transactions").get()).toEqual({ count: 0 });
  } finally {
    book.close();
  }
});

test("a second transfer line is rejected", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing");
    const savings = account(book.db, "Savings", "savings");
    const cash = account(book.db, "Cash", "cash");
    expectCode(
      () =>
        createTransaction(
          book.db,
          entry(chequing.id, -100, [
            { amount: -40, transferAccountId: savings.id },
            { amount: -60, transferAccountId: cash.id },
          ]),
        ),
      "transfer_line_limit",
    );

    const created = createTransaction(
      book.db,
      entry(chequing.id, -25, [{ amount: -25, memo: "Shop" }]),
    );
    expectCode(
      () =>
        updateTransaction(
          book.db,
          created.id,
          entry(chequing.id, -25, [
            { amount: -10, transferAccountId: savings.id },
            { amount: -15, transferAccountId: cash.id },
          ]),
        ),
      "transfer_line_limit",
    );
    expect(getTransaction(book.db, created.id)?.lines).toHaveLength(1);
    expect(getTransaction(book.db, created.id)?.transferPeerId).toBeNull();
  } finally {
    book.close();
  }
});

test("a reconciled transaction accepts a category change and rejects an amount change", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing");
    const savings = account(book.db, "Savings", "savings");
    const food = createCategory(book.db, { name: "Food", kind: "expense", ...saved });
    const created = createTransaction(book.db, entry(chequing.id, -15, [{ amount: -15 }]));
    book.sqlite.query("update transactions set status = 'reconciled' where id = ?").run(created.id);
    expect(getTransaction(book.db, created.id)?.status).toBe("reconciled");
    expectCode(
      () => updateTransaction(book.db, created.id, entry(chequing.id, -16, [{ amount: -16 }])),
      "transaction_reconciled",
    );
    const changed = updateTransaction(book.db, created.id, entry(chequing.id, -15, [{ amount: -15, categoryId: food.id }]));
    expect(changed.status).toBe("reconciled");
    expect(changed.amount).toBe(-15);
    expect(changed.lines[0]?.categoryId).toBe(food.id);
    expectCode(() => deleteTransaction(book.db, created.id, saved), "transaction_reconciled");
    expect(getTransaction(book.db, created.id)?.deletedAt).toBeNull();

    const transfer = createTransaction(
      book.db,
      entry(chequing.id, -30, [{ amount: -30, transferAccountId: savings.id }]),
    );
    const mirror = requirePeer(book.db, transfer);
    book.sqlite.query("update transactions set status = 'reconciled' where id = ?").run(mirror.id);
    expectCode(
      () =>
        updateTransaction(
          book.db,
          transfer.id,
          entry(chequing.id, -31, [{ amount: -31, transferAccountId: savings.id }]),
        ),
      "transaction_reconciled",
    );
    expectCode(() => deleteTransaction(book.db, transfer.id, saved), "transaction_reconciled");
    expect(getTransaction(book.db, transfer.id)?.amount).toBe(-30);
    expect(getTransaction(book.db, mirror.id)?.amount).toBe(30);
    expect(getTransaction(book.db, mirror.id)?.deletedAt).toBeNull();
  } finally {
    book.close();
  }
});

test("a mortgage payment splits principal and interest", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing");
    const mortgage = account(book.db, "Mortgage", "mortgage");
    const interest = createCategory(book.db, { name: "Interest", kind: "expense", ...saved });
    const created = createTransaction(book.db, {
      accountId: chequing.id,
      date: "2026-04-01",
      amount: -150_000,
      payeeRaw: "Example lender",
      status: "cleared",
      lines: [
        { amount: -120_000, transferAccountId: mortgage.id },
        { amount: -30_000, categoryId: interest.id, memo: "Interest" },
      ],
      ...saved,
    });
    expect(created.lines.map((line) => line.amount)).toEqual([-120_000, -30_000]);
    expect(created.lines[1]?.categoryId).toBe(interest.id);
    const mirror = requirePeer(book.db, created);
    expect(mirror.accountId).toBe(mortgage.id);
    expect(mirror.amount).toBe(120_000);
    expect(mirror.date).toBe("2026-04-01");
    expect(mirror.lines).toHaveLength(1);
    expect(mirror.lines[0]?.amount).toBe(120_000);
    expect(mirror.lines[0]?.transferAccountId).toBe(chequing.id);
    expect(mirror.lines[0]?.categoryId).toBeNull();
    expect(mirror.status).toBe("open");
    expect(created.status).toBe("cleared");
  } finally {
    book.close();
  }
});

test("a transfer links an opposite row within 3 days and mirrors when none matches", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing");
    const visa = account(book.db, "Visa", "savings");
    const incoming = createTransaction(book.db, entry(visa.id, 5_000, [{ amount: 5_000 }], "2026-04-02"));
    const outgoing = createTransaction(
      book.db,
      entry(chequing.id, -5_000, [{ amount: -5_000, transferAccountId: visa.id }], "2026-04-01"),
    );
    expect(outgoing.transferPeerId).toBe(incoming.id);
    const linked = getTransaction(book.db, incoming.id);
    expect(linked?.transferPeerId).toBe(outgoing.id);
    expect(linked?.amount).toBe(5_000);
    expect(linked?.lines[0]?.transferAccountId).toBe(chequing.id);

    const far = createTransaction(book.db, entry(visa.id, 800, [{ amount: 800 }], "2026-05-01"));
    const tooFar = createTransaction(
      book.db,
      entry(chequing.id, -800, [{ amount: -800, transferAccountId: visa.id }], "2026-05-05"),
    );
    expect(tooFar.transferPeerId).not.toBe(far.id);
    expect(getTransaction(book.db, far.id)?.transferPeerId).toBeNull();
    const mirror = requirePeer(book.db, tooFar);
    expect(mirror.accountId).toBe(visa.id);
    expect(mirror.amount).toBe(800);

    const held = createTransaction(book.db, entry(visa.id, 100, [{ amount: 100 }], "2026-06-01"));
    book.sqlite.query("update transactions set status = 'reconciled' where id = ?").run(held.id);
    const aroundHeld = createTransaction(
      book.db,
      entry(chequing.id, -100, [{ amount: -100, transferAccountId: visa.id }], "2026-06-01"),
    );
    expect(aroundHeld.transferPeerId).not.toBe(held.id);
    expect(getTransaction(book.db, held.id)?.transferPeerId).toBeNull();
  } finally {
    book.close();
  }
});
