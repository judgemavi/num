import { expect, test } from "bun:test";
import { createCheckpoint } from "./checkpoints";
import { createCategory } from "./categories";
import { createMerchant } from "./merchants";
import { createTransaction, deleteTransaction, getTransaction, updateTransaction } from "./transactions";
import { tempDatabase, saved, account, entry, requirePeer } from "./transaction-test-book";

test("a mortgage payment puts the principal and the interest on two lines", () => {
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
    // Chequing and the mortgage get no imports (decision 0052).
    expect(mirror.status).toBe("cleared");
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
