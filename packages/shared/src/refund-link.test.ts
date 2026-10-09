import { describe, expect, test } from "bun:test";
import { categoryForRefund, rankRefundPurchases, refundLinkAllowed } from "./refund-link";

describe("refund link", () => {
  test("sets the category from the purchase and stays valid with a partial amount", () => {
    const purchase = { categoryId: "groceries", amount: -8_000, date: "2026-03-03" };
    expect(categoryForRefund(purchase)).toBe("groceries");
    expect(
      refundLinkAllowed({
        purchaseAmount: purchase.amount,
        purchaseDate: purchase.date,
        refundAmount: 3_000,
        refundDate: "2026-03-20",
      }),
    ).toBe(true);
  });

  test("rejects a refund that is not money in or that is older than 90 days", () => {
    expect(
      refundLinkAllowed({
        purchaseAmount: -8_000,
        purchaseDate: "2026-03-03",
        refundAmount: -100,
        refundDate: "2026-03-20",
      }),
    ).toBe(false);
    expect(
      refundLinkAllowed({
        purchaseAmount: -8_000,
        purchaseDate: "2026-01-01",
        refundAmount: 3_000,
        refundDate: "2026-05-01",
      }),
    ).toBe(false);
  });

  test("lists the same payee or merchant before other spending in the last 90 days", () => {
    const rows = [
      { id: "other", date: "2026-03-01", amount: -100, payeeRaw: "Other", payeeNormalized: "OTHER", merchantId: null, categoryId: "food" },
      { id: "same", date: "2026-02-01", amount: -8000, payeeRaw: "Cafe", payeeNormalized: "CAFE", merchantId: "m1", categoryId: "food" },
      { id: "old", date: "2025-01-01", amount: -8000, payeeRaw: "Cafe", payeeNormalized: "CAFE", merchantId: "m1", categoryId: "food" },
      { id: "income", date: "2026-03-02", amount: 500, payeeRaw: "Cafe", payeeNormalized: "CAFE", merchantId: "m1", categoryId: "pay" },
    ];
    expect(rankRefundPurchases("2026-03-20", "CAFE", "m1", rows).map((row) => row.id)).toEqual(["same", "other"]);
  });
});
