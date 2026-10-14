import { describe, expect, test } from "bun:test";
import type { Transaction } from "@num/shared";
import { transactionValues } from "./transaction-draft";
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
    notes: null,
    payeeRaw: "E-TRANSFER",
    payeeNormalized: "E-TRANSFER",
    status: "cleared",
    reconciled: false,
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

describe("keep uncategorized on save (decisions 0024, 0045)", () => {
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

describe("the answer to a Needs review question (decision 0047)", () => {
  const otherId = "00000000-0000-4000-8000-000000000006";
  const planId = "00000000-0000-4000-8000-000000000007";
  const base = { level: "none" as const, reason: null, suggestion: null, itemKey: null, transfer: null, recurring: null, refund: null };

  test("a save with no other change still sends the answer", () => {
    const transaction = stored(null, null);
    const answer = reviewAnswer({ ...base, question: "refund_purchase" }, null, "2026-03-02");
    const values = transactionValues([], transaction, "");
    const built = buildTransactionSave({ ...values, currency: "USD", transaction, totalMilli: transaction.amount, answer });
    expect(built.ok && built.save?.kind === "update" && built.save.body.answer).toEqual({ question: "refund_purchase" });
  });

  test("a transfer pair always sends its answer: the saved lines give yes or no", () => {
    const transfer = { otherId, otherAccountId: planId, otherPayee: "Deposit", otherAmount: -40_000, otherDate: "2026-03-01" };
    expect(reviewAnswer({ ...base, question: "transfer_pair", transfer }, null, "2026-03-02")).toEqual({
      question: "transfer_pair",
      otherId,
      asOf: "2026-03-02",
    });
  });

  test("Payment for is an answer only when the person chose the payment", () => {
    const review = { ...base, question: "recurring_ambiguous" as const, recurring: { planId, dueDate: "2026-03-01" } };
    expect(reviewAnswer(review, null, "2026-03-02")).toBeUndefined();
    expect(reviewAnswer(review, `${planId}:2026-03-01`, "2026-03-02")).toEqual({ question: "recurring_ambiguous", planId, dueDate: "2026-03-01" });
  });
});
