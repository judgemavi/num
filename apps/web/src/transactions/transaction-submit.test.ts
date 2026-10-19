import { describe, expect, test } from "bun:test";
import type { Transaction } from "@num/shared";
import { directionOf, signedTotal, transactionValues } from "./transaction-draft";
import { buildTransactionSave, reviewAnswer } from "./transaction-submit";

const id = "00000000-0000-4000-8000-000000000001";
const category = "00000000-0000-4000-8000-000000000002";

function stored(categoryId: string | null, autoReason: Transaction["autoReason"]): Transaction {
  return {
    id,
    accountId: "00000000-0000-4000-8000-000000000003",
    date: "2026-03-01",
    amount: 40_000,
    merchantId: null,
    payeeRaw: "E-TRANSFER",
    payeeNormalized: "E-TRANSFER",
    status: "cleared",
    source: "import",
    importRowId: null,
    transferPeerId: null,
    mirror: false,
    autoReason,
    autoSourceId: autoReason ? "00000000-0000-4000-8000-000000000004" : null,
    autoConfidence: autoReason ? 950 : null,
    refundOfId: null,
    refundOf: null,
    refundedAmount: null,
    lines: [{ id: "00000000-0000-4000-8000-000000000005", amount: 40_000, memo: null, categoryId, transferAccountId: null, tagIds: [] }],
  };
}

function save(transaction: Transaction, categoryId: string | null) {
  const values = { ...transactionValues([], transaction, ""), categoryId };
  const built = buildTransactionSave({ ...values, currency: "USD", transaction, totalMilli: transaction.amount });
  return built.ok ? built.save : null;
}

describe("keep uncategorized on save", () => {
  test("removing an automatic label and saving with no category keeps the row", () => {
    const result = save(stored(category, "learned_payee"), null);
    expect(result?.kind).toBe("update");
    expect(result?.kind === "update" && result.body.keepUncategorized).toBe(true);
    expect(result?.kind === "update" && result.body.lines?.[0]?.categoryId).toBe(null);
  });

  test("an automatic label that stays is a confirmation, not a keep", () => {
    expect(save(stored(category, "learned_payee"), category)).toEqual({ kind: "confirm", id });
  });

  test("a confirmed row whose category is removed is not kept", () => {
    const result = save(stored(category, null), null);
    expect(result?.kind === "update" && result.body.keepUncategorized).toBe(false);
  });

  test("an uncategorized row saved with no change is kept", () => {
    const result = save(stored(null, null), null);
    expect(result?.kind === "update" && result.body.keepUncategorized).toBe(true);
  });
});

describe("the answer to a Needs review question", () => {
  const otherId = "00000000-0000-4000-8000-000000000006";
  const bucketId = "00000000-0000-4000-8000-000000000007";
  const base = { level: "none" as const, reason: null, suggestion: null, itemKey: null, transfer: null, recurring: null, refund: null };

  test("a save with no other change still sends the answer", () => {
    const transaction = stored(null, null);
    const answer = reviewAnswer({ ...base, question: "refund_purchase" }, null, "2026-03-02");
    const values = transactionValues([], transaction, "");
    const built = buildTransactionSave({ ...values, currency: "USD", transaction, totalMilli: transaction.amount, answer });
    expect(built.ok && built.save?.kind === "update" && built.save.body.answer).toEqual({ question: "refund_purchase" });
  });

  test("a transfer pair always sends its answer: the saved lines give yes or no", () => {
    const transfer = { otherId, otherAccountId: bucketId, otherPayee: "Deposit", otherAmount: -40_000, otherDate: "2026-03-01" };
    expect(reviewAnswer({ ...base, question: "transfer_pair", transfer }, null, "2026-03-02")).toEqual({
      question: "transfer_pair",
      otherId,
      asOf: "2026-03-02",
    });
  });

  test("Payment for is an answer only when the person chose the payment", () => {
    const review = { ...base, question: "recurring_ambiguous" as const, recurring: { bucketId, dueDate: "2026-03-01" } };
    expect(reviewAnswer(review, null, "2026-03-02")).toBeUndefined();
    expect(reviewAnswer(review, `${bucketId}:2026-03-01`, "2026-03-02")).toEqual({ question: "recurring_ambiguous", bucketId, dueDate: "2026-03-01" });
  });
});

describe("a loan payment", () => {
  const loan = "00000000-0000-4000-8000-000000000008";
  const interestCategory = "00000000-0000-4000-8000-000000000009";
  const values = { ...transactionValues([], null, "00000000-0000-4000-8000-000000000003"), choice: "loan_payment" as const, transferAccountId: loan, interestCategoryId: interestCategory };

  function build(interest: string, transaction: Transaction | null = null, totalMilli = -1_500_000) {
    return buildTransactionSave({ ...values, payee: "Lender", date: "2026-03-01", interest, currency: "USD", transaction, totalMilli });
  }

  test("the interest goes on its category and the principal goes to the loan account", () => {
    const built = build("400");
    expect(built.ok && built.save?.kind === "create" && built.save.body.lines).toEqual([
      { amount: -400_000, memo: null, categoryId: interestCategory, transferAccountId: null, tagIds: [] },
      { amount: -1_100_000, memo: null, categoryId: null, transferAccountId: loan, tagIds: [] },
    ]);
    expect(built.ok && built.save?.kind === "create" && built.save.body.merchantId).toBeNull();
  });

  test("the interest must be more than zero and less than the amount", () => {
    expect(build("")).toEqual({ ok: false, error: "Enter the interest." });
    expect(build("0")).toEqual({ ok: false, error: "Enter the interest." });
    expect(build("1500")).toEqual({ ok: false, error: "The interest must be less than the amount." });
    expect(build("1600")).toEqual({ ok: false, error: "The interest must be less than the amount." });
    expect(build("1499.99").ok).toBe(true);
  });

  test("a saved loan payment opens as Loan payment, and a save with no change has no write", () => {
    const saved: Transaction = {
      ...stored(null, null),
      amount: -1_500_000,
      source: "manual",
      lines: [
        { id: "00000000-0000-4000-8000-000000000010", amount: -1_100_000, memo: null, categoryId: null, transferAccountId: loan, tagIds: [] },
        { id: "00000000-0000-4000-8000-000000000011", amount: -400_000, memo: null, categoryId: interestCategory, transferAccountId: null, tagIds: [] },
      ],
    };
    const start = transactionValues([], saved, "");
    expect(start.choice).toBe("loan_payment");
    expect(start.transferAccountId).toBe(loan);
    expect(start.interest).toBe("400");
    expect(start.interestCategoryId).toBe(interestCategory);
    expect(buildTransactionSave({ ...start, currency: "USD", transaction: saved, totalMilli: saved.amount })).toEqual({ ok: true, save: null });
  });
});

describe("the type gives the sign", () => {
  const savings = "00000000-0000-4000-8000-000000000012";

  test("a new transaction is money out for Spending and Loan payment, money in for Income and Refund, and the From side of a transfer", () => {
    const start = transactionValues([], null, savings);
    expect(start.choice).toBe("spending");
    expect(directionOf(start)).toBe("out");
    expect(directionOf({ ...start, choice: "loan_payment" })).toBe("out");
    expect(directionOf({ ...start, choice: "income" })).toBe("in");
    expect(directionOf({ ...start, choice: "refund" })).toBe("in");
    expect(directionOf({ ...start, choice: "transfer" })).toBe("out");
    expect(signedTotal("USD", null, "40", directionOf({ ...start, choice: "income" }))).toBe(40_000);
    expect(signedTotal("USD", null, "40", directionOf(start))).toBe(-40_000);
  });

  test("a saved money-in transfer opens as the To side, and a save with no change has no write", () => {
    const saved: Transaction = {
      ...stored(null, null),
      source: "manual",
      lines: [{ id: "00000000-0000-4000-8000-000000000013", amount: 40_000, memo: null, categoryId: null, transferAccountId: savings, tagIds: [] }],
    };
    const start = transactionValues([], saved, "");
    expect(start.choice).toBe("transfer");
    expect(start.transferSide).toBe("in");
    expect(start.transferAccountId).toBe(savings);
    expect(directionOf(start)).toBe("in");
    expect(buildTransactionSave({ ...start, currency: "USD", transaction: saved, totalMilli: saved.amount })).toEqual({ ok: true, save: null });
  });

  test("a saved money-in transaction that becomes Spending is money out", () => {
    const start = transactionValues([], stored(category, null), "");
    expect(directionOf(start)).toBe("in");
    expect(directionOf({ ...start, choice: "spending" })).toBe("out");
  });
});
