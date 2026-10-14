import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase, settings } from "@num/db";
import type { AccountKind, ErrorCode, Transaction, TransactionCreate, TransactionLineInput } from "@num/shared";
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { createDb, type Db } from "../db";
import { ServiceError } from "../service-error";
import { createAccount } from "./accounts";
import { createCheckpoint } from "./checkpoints";
import { createCategory } from "./categories";
import { createMerchant } from "./merchants";
import { createTag } from "./tags";
import { createTransaction, deleteTransaction, getTransaction, updateTransaction } from "./transactions";

function tempDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "num-transactions-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  db.insert(settings).values({ key: "currency", value: "CAD" }).run();
  return {
    db,
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
      entry(chequing.id, -1000, [
        { amount: -600, memo: "Food" },
        { amount: -400, memo: "Taxi" },
      ]),
    );
    expect(created.amount).toBe(-1000);
    expect(created.lines.map((line) => line.amount)).toEqual([-600, -400]);

    expectCode(
      () => createTransaction(book.db, entry(chequing.id, -1000, [{ amount: -600 }])),
      "lines_sum_mismatch",
    );

    expectCode(
      () =>
        updateTransaction(book.db, created.id, entry(chequing.id, -1000, [{ amount: -900 }, { amount: -50 }])),
      "lines_sum_mismatch",
    );
    expect(getTransaction(book.db, created.id)?.amount).toBe(-1000);
    expect(getTransaction(book.db, created.id)?.lines.map((line) => line.amount)).toEqual([-600, -400]);
  } finally {
    book.close();
  }
});

test("an amount must be a whole number of minor units of the book currency", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing");
    expectCode(() => createTransaction(book.db, entry(chequing.id, -12_345, [{ amount: -12_345 }])), "amount_too_precise");
    expect(createTransaction(book.db, entry(chequing.id, -12_340, [{ amount: -12_340 }])).amount).toBe(-12_340);
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
          entry(chequing.id, -50_000, [
            { amount: -50_000, transferAccountId: savings.id, tagIds: [tag.id] },
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
    expect(mirror.amount).toBe(50_000);
    expect(mirror.date).toBe(payment.date);
    expect(mirror.transferPeerId).toBe(payment.id);
    expect(mirror.lines).toHaveLength(1);
    expect(mirror.lines[0]?.transferAccountId).toBe(chequing.id);
    expect(mirror.lines[0]?.amount).toBe(50_000);
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
            -70_000,
            [{ amount: -70_000, transferAccountId: savings.id, tagIds: [tag.id] }],
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
    expect(next.amount).toBe(-70_000);
    expect(next.date).toBe("2026-03-05");
    expect(nextMirror.amount).toBe(70_000);
    expect(nextMirror.date).toBe("2026-03-05");
    expect(nextMirror.lines).toHaveLength(1);
    expect(nextMirror.lines[0]?.amount).toBe(70_000);
    expect(nextMirror.lines[0]?.transferAccountId).toBe(chequing.id);

    expectCode(
      () => updateTransaction(book.db, payment.id, entry(chequing.id, -70_000, [{ amount: -10 }])),
      "lines_sum_mismatch",
    );
    expect(getTransaction(book.db, payment.id)?.amount).toBe(-70_000);
    expect(getTransaction(book.db, nextMirror.id)?.amount).toBe(70_000);

    expect(
      countWrites(book.sqlite, () => {
        deleteTransaction(book.db, payment.id, saved);
      }),
    ).toBe(1);
    expect(getTransaction(book.db, payment.id)).toBeNull();
    expect(getTransaction(book.db, nextMirror.id)).toBeNull();
  } finally {
    book.close();
  }
});

test("a transfer to the same account is rejected", () => {
  const book = tempDatabase();
  try {
    const cash = account(book.db, "Cash", "cash");
    expectCode(
      () => createTransaction(book.db, entry(cash.id, -200, [{ amount: -200, transferAccountId: cash.id }])),
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
          entry(chequing.id, -1000, [
            { amount: -400, transferAccountId: savings.id },
            { amount: -600, transferAccountId: cash.id },
          ]),
        ),
      "transfer_line_limit",
    );

    const created = createTransaction(
      book.db,
      entry(chequing.id, -250, [{ amount: -250, memo: "Shop" }]),
    );
    expectCode(
      () =>
        updateTransaction(
          book.db,
          created.id,
          entry(chequing.id, -250, [
            { amount: -100, transferAccountId: savings.id },
            { amount: -150, transferAccountId: cash.id },
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
    const created = createTransaction(book.db, entry(chequing.id, -150, [{ amount: -150 }]));
    createCheckpoint(book.db, chequing.id, { date: created.date, statementBalance: -150, ...saved });
    expect(getTransaction(book.db, created.id)?.reconciled).toBe(true);
    expect(getTransaction(book.db, created.id)?.status).toBe("open");
    expectCode(
      () => updateTransaction(book.db, created.id, entry(chequing.id, -160, [{ amount: -160 }])),
      "transaction_reconciled",
    );
    const changed = updateTransaction(book.db, created.id, entry(chequing.id, -150, [{ amount: -150, categoryId: food.id }]));
    expect(changed.reconciled).toBe(true);
    expect(changed.status).toBe("open");
    expect(changed.amount).toBe(-150);
    expect(changed.lines[0]?.categoryId).toBe(food.id);
    expectCode(() => deleteTransaction(book.db, created.id, saved), "transaction_reconciled");
    expect(getTransaction(book.db, created.id)?.reconciled).toBe(true);

    const transfer = createTransaction(
      book.db,
      entry(chequing.id, -300, [{ amount: -300, transferAccountId: savings.id }]),
    );
    const mirror = requirePeer(book.db, transfer);
    createCheckpoint(book.db, savings.id, { date: mirror.date, statementBalance: 300, ...saved });
    expectCode(
      () =>
        updateTransaction(
          book.db,
          transfer.id,
          entry(chequing.id, -310, [{ amount: -310, transferAccountId: savings.id }]),
        ),
      "transaction_reconciled",
    );
    expectCode(() => deleteTransaction(book.db, transfer.id, saved), "transaction_reconciled");
    expect(getTransaction(book.db, transfer.id)?.amount).toBe(-300);
    expect(getTransaction(book.db, mirror.id)?.amount).toBe(300);
    expect(getTransaction(book.db, mirror.id)?.reconciled).toBe(true);
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
      amount: -1_500_000,
      payeeRaw: "Example lender",
      status: "cleared",
      lines: [
        { amount: -1_200_000, transferAccountId: mortgage.id },
        { amount: -300_000, categoryId: interest.id, memo: "Interest" },
      ],
      ...saved,
    });
    expect(created.lines.map((line) => line.amount)).toEqual([-1_200_000, -300_000]);
    expect(created.lines[1]?.categoryId).toBe(interest.id);
    const mirror = requirePeer(book.db, created);
    expect(mirror.accountId).toBe(mortgage.id);
    expect(mirror.amount).toBe(1_200_000);
    expect(mirror.date).toBe("2026-04-01");
    expect(mirror.lines).toHaveLength(1);
    expect(mirror.lines[0]?.amount).toBe(1_200_000);
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
    const incoming = createTransaction(book.db, entry(visa.id, 50_000, [{ amount: 50_000 }], "2026-04-02"));
    const outgoing = createTransaction(
      book.db,
      entry(chequing.id, -50_000, [{ amount: -50_000, transferAccountId: visa.id }], "2026-04-01"),
    );
    expect(outgoing.transferPeerId).toBe(incoming.id);
    const linked = getTransaction(book.db, incoming.id);
    expect(linked?.transferPeerId).toBe(outgoing.id);
    expect(linked?.amount).toBe(50_000);
    expect(linked?.lines[0]?.transferAccountId).toBe(chequing.id);

    const far = createTransaction(book.db, entry(visa.id, 8000, [{ amount: 8000 }], "2026-05-01"));
    const tooFar = createTransaction(
      book.db,
      entry(chequing.id, -8000, [{ amount: -8000, transferAccountId: visa.id }], "2026-05-05"),
    );
    expect(tooFar.transferPeerId).not.toBe(far.id);
    expect(getTransaction(book.db, far.id)?.transferPeerId).toBeNull();
    const mirror = requirePeer(book.db, tooFar);
    expect(mirror.accountId).toBe(visa.id);
    expect(mirror.amount).toBe(8000);

    const held = createTransaction(book.db, entry(visa.id, 1000, [{ amount: 1000 }], "2026-06-01"));
    createCheckpoint(book.db, visa.id, { date: "2026-06-01", statementBalance: 67_000, ...saved });
    const aroundHeld = createTransaction(
      book.db,
      entry(chequing.id, -1000, [{ amount: -1000, transferAccountId: visa.id }], "2026-06-01"),
    );
    expect(aroundHeld.transferPeerId).not.toBe(held.id);
    expect(getTransaction(book.db, held.id)?.transferPeerId).toBeNull();
  } finally {
    book.close();
  }
});

test("changing a linked transfer to a category keeps the other row", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing");
    const visa = account(book.db, "Visa", "savings");
    const food = createCategory(book.db, { name: "Groceries", kind: "expense", ...saved });
    const card = createTransaction(book.db, entry(visa.id, 50_000, [{ amount: 50_000 }], "2026-04-02"));
    const payment = createTransaction(
      book.db,
      entry(chequing.id, -50_000, [{ amount: -50_000, transferAccountId: visa.id }], "2026-04-01"),
    );
    expect(payment.transferPeerId).toBe(card.id);
    expect(payment.mirror).toBe(false);
    expect(getTransaction(book.db, card.id)?.mirror).toBe(false);
    const edited = updateTransaction(
      book.db,
      payment.id,
      entry(chequing.id, -50_000, [{ amount: -50_000, categoryId: food.id }], "2026-04-01"),
    );
    expect(edited.transferPeerId).toBeNull();
    const peer = getTransaction(book.db, card.id);
    expect(peer).not.toBeNull();
    expect(peer?.transferPeerId).toBeNull();
    expect(peer?.amount).toBe(50_000);
    expect(peer?.autoReason).toBeNull();
    expect(peer?.lines[0]?.categoryId).toBeNull();
    expect(peer?.lines[0]?.transferAccountId).toBeNull();
  } finally {
    book.close();
  }
});

test("deleting one side of a linked pair keeps the other", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing");
    const visa = account(book.db, "Visa", "savings");
    const card = createTransaction(book.db, entry(visa.id, 50_000, [{ amount: 50_000 }], "2026-04-02"));
    const payment = createTransaction(
      book.db,
      entry(chequing.id, -50_000, [{ amount: -50_000, transferAccountId: visa.id }], "2026-04-01"),
    );
    deleteTransaction(book.db, payment.id, saved);
    const peer = getTransaction(book.db, card.id);
    expect(peer).not.toBeNull();
    expect(peer?.amount).toBe(50_000);
    expect(peer?.transferPeerId).toBeNull();
    expect(getTransaction(book.db, payment.id)).toBeNull();
  } finally {
    book.close();
  }
});

test("removing a transfer deletes the mirror and keeps a linked row", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing");
    const savings = account(book.db, "Savings", "savings");
    const food = createCategory(book.db, { name: "Groceries", kind: "expense", ...saved });
    const created = createTransaction(
      book.db,
      entry(chequing.id, -30_000, [{ amount: -30_000, transferAccountId: savings.id }]),
    );
    const mirrorId = created.transferPeerId;
    if (!mirrorId) {
      throw new Error("Mirror is missing");
    }
    expect(getTransaction(book.db, mirrorId)?.mirror).toBe(true);
    updateTransaction(book.db, created.id, entry(chequing.id, -30_000, [{ amount: -30_000, categoryId: food.id }]));
    expect(getTransaction(book.db, mirrorId)).toBeNull();
  } finally {
    book.close();
  }
});

test("updateTransaction links an existing opposite row", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing");
    const visa = account(book.db, "Visa", "savings");
    const card = createTransaction(book.db, entry(visa.id, 50_000, [{ amount: 50_000 }], "2026-04-02"));
    const payment = createTransaction(book.db, entry(chequing.id, -50_000, [{ amount: -50_000 }], "2026-04-01"));
    const edited = updateTransaction(
      book.db,
      payment.id,
      entry(chequing.id, -50_000, [{ amount: -50_000, transferAccountId: visa.id }], "2026-04-01"),
    );
    expect(edited.transferPeerId).toBe(card.id);
    expect(edited.mirror).toBe(false);
    const peer = getTransaction(book.db, card.id);
    expect(peer?.mirror).toBe(false);
    expect(peer?.transferPeerId).toBe(payment.id);
    expect(peer).not.toBeNull();
    expect(book.sqlite.query("select count(*) as n from transactions").get()).toEqual({ n: 2 });
  } finally {
    book.close();
  }
});

test("a linked refund takes the category and merchant of the purchase and ignores client values", () => {
  const { db, close } = tempDatabase();
  try {
    const checking = account(db, "Checking", "chequing");
    const groceries = createCategory(db, { name: "Groceries", kind: "expense", ...saved });
    const fun = createCategory(db, { name: "Fun", kind: "expense", ...saved });
    const store = createMerchant(db, { name: "Store", ...saved });
    const other = createMerchant(db, { name: "Other", ...saved });
    const purchase = createTransaction(db, {
      ...entry(checking.id, -80_000, [{ amount: -80_000, categoryId: groceries.id }]),
      merchantId: store.id,
    });
    const refund = createTransaction(db, {
      ...entry(checking.id, 30_000, [{ amount: 30_000, categoryId: fun.id }], "2026-03-10"),
      merchantId: other.id,
      refundOfId: purchase.id,
    });
    expect(refund.merchantId).toBe(store.id);
    expect(refund.lines[0]?.categoryId).toBe(groceries.id);
    const edited = updateTransaction(db, refund.id, {
      ...entry(checking.id, 30_000, [{ amount: 30_000, categoryId: fun.id }], "2026-03-10"),
      merchantId: other.id,
    });
    expect(edited.merchantId).toBe(store.id);
    expect(edited.lines[0]?.categoryId).toBe(groceries.id);
    const plain = createTransaction(db, {
      ...entry(checking.id, -5000, [{ amount: -5000, categoryId: groceries.id }]),
    });
    const noMerchant = createTransaction(db, {
      ...entry(checking.id, 1000, [{ amount: 1000, categoryId: fun.id }], "2026-03-10"),
      merchantId: other.id,
      refundOfId: plain.id,
    });
    expect(noMerchant.merchantId).toBeNull();
  } finally {
    close();
  }
});
