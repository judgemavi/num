import type { Transaction } from "@num/shared";
import { expect, test } from "bun:test";
import { createCategory } from "./categories";
import { createTag } from "./tags";
import { createTransaction, deleteTransaction, getTransaction, updateTransaction } from "./transactions";
import { tempDatabase, saved, expectCode, account, entry, countWrites, requirePeer } from "./transaction-test-book";

test("lines must sum to the transaction amount", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing");
    const mortgage = account(book.db, "Mortgage", "mortgage");
    const interest = createCategory(book.db, { name: "Interest", kind: "expense", ...saved });
    const created = createTransaction(
      book.db,
      entry(chequing.id, -1000, [
        { amount: -600, categoryId: interest.id },
        { amount: -400, transferAccountId: mortgage.id },
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
        updateTransaction(
          book.db,
          created.id,
          entry(chequing.id, -1000, [
            { amount: -900, categoryId: interest.id },
            { amount: -50, transferAccountId: mortgage.id },
          ]),
        ),
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

test("a transaction with more than one line must be a loan payment (decision 0053)", () => {
  const book = tempDatabase();
  try {
    const chequing = account(book.db, "Chequing", "chequing");
    const savings = account(book.db, "Savings", "savings");
    const mortgage = account(book.db, "Mortgage", "mortgage");
    const loan = account(book.db, "Car loan", "loan");
    const interest = createCategory(book.db, { name: "Interest", kind: "expense", ...saved });
    const fees = createCategory(book.db, { name: "Fees", kind: "expense", ...saved });
    const salary = createCategory(book.db, { name: "Salary", kind: "income", ...saved });
    const refused = [
      [
        { amount: -400, categoryId: interest.id },
        { amount: -600, categoryId: fees.id },
      ],
      [
        { amount: -400, transferAccountId: mortgage.id },
        { amount: -600, transferAccountId: loan.id },
      ],
      [
        { amount: -1_200, categoryId: interest.id },
        { amount: 200, transferAccountId: mortgage.id },
      ],
      [
        { amount: -400, categoryId: interest.id },
        { amount: -600, transferAccountId: savings.id },
      ],
      [
        { amount: -400, categoryId: salary.id },
        { amount: -600, transferAccountId: mortgage.id },
      ],
      [
        { amount: -400, categoryId: interest.id },
        { amount: -600 },
      ],
      [
        { amount: -300, categoryId: interest.id },
        { amount: -300, categoryId: fees.id },
        { amount: -400, transferAccountId: mortgage.id },
      ],
    ];
    for (const lines of refused) {
      expectCode(() => createTransaction(book.db, entry(chequing.id, -1_000, lines)), "lines_not_loan_payment");
    }
    const plain = createTransaction(book.db, entry(chequing.id, -1_000, [{ amount: -1_000 }]));
    for (const lines of refused) {
      expectCode(() => updateTransaction(book.db, plain.id, entry(chequing.id, -1_000, lines)), "lines_not_loan_payment");
    }
    expect(getTransaction(book.db, plain.id)?.lines).toHaveLength(1);
    expect(book.sqlite.query("select count(*) as count from transactions").get()).toEqual({ count: 1 });

    const payment = createTransaction(
      book.db,
      entry(chequing.id, -1_000, [
        { amount: -400, categoryId: interest.id },
        { amount: -600, transferAccountId: loan.id },
      ]),
    );
    const principal = requirePeer(book.db, payment);
    expect(principal.accountId).toBe(loan.id);
    expect(principal.amount).toBe(600);
    expect(principal.mirror).toBe(true);
    // A loan account gets no imports (decision 0052).
    expect(principal.status).toBe("cleared");
    const updated = updateTransaction(
      book.db,
      plain.id,
      entry(chequing.id, -1_000, [
        { amount: -600, transferAccountId: mortgage.id },
        { amount: -400, categoryId: interest.id },
      ]),
    );
    expect(requirePeer(book.db, updated).accountId).toBe(mortgage.id);
  } finally {
    book.close();
  }
});

