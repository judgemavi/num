import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { isoDateSchema } from "./date";
import { centsSchema } from "./money";

export const refundWindowDays = 90;

export type RefundPurchase = {
  id: string;
  date: string;
  amount: number;
  payeeRaw: string;
  payeeNormalized: string;
  merchantId: string | null;
  categoryId: string | null;
};


export const refundPurchaseQuerySchema = z.object({
  asOf: isoDateSchema,
  payee: z.string().trim().optional(),
});

export const refundPurchaseItemSchema = z.object({
  id: z.uuid(),
  date: isoDateSchema,
  amount: centsSchema,
  payeeRaw: z.string(),
  categoryId: z.uuid(),
  merchantId: z.uuid().nullable(),
});

export const refundPurchaseListSchema = z.object({
  items: z.array(refundPurchaseItemSchema),
});

export type RefundPurchaseItem = z.infer<typeof refundPurchaseItemSchema>;

export function categoryForRefund(purchase: { categoryId: string | null }): string | null {
  return purchase.categoryId;
}

export function refundWindowStart(asOf: string): string {
  return Temporal.PlainDate.from(asOf).subtract({ days: refundWindowDays }).toString();
}

function daySpan(earlier: string, later: string): number {
  return Temporal.PlainDate.from(earlier).until(Temporal.PlainDate.from(later), { largestUnit: "day" }).days;
}

/** A missing field keeps the stored link. Only an explicit null clears it. */
export function refundOfIdAfterEdit(current: string | null, incoming: string | null | undefined): string | null {
  if (incoming === undefined) {
    return current;
  }
  return incoming;
}

/** A partial refund stays linked when it is money in, on or after the purchase, within 90 days. */
export function refundLinkAllowed(input: {
  purchaseAmount: number;
  purchaseDate: string;
  refundAmount: number;
  refundDate: string;
}): boolean {
  if (input.purchaseAmount >= 0 || input.refundAmount <= 0 || input.purchaseDate > input.refundDate) {
    return false;
  }
  return daySpan(input.purchaseDate, input.refundDate) <= refundWindowDays;
}

function preferred(row: RefundPurchase, payeeNormalized: string): boolean {
  return payeeNormalized.length > 0 && row.payeeNormalized === payeeNormalized;
}

export function rankRefundPurchases(
  asOf: string,
  payeeNormalized: string,
  rows: readonly RefundPurchase[],
): RefundPurchase[] {
  const start = refundWindowStart(asOf);
  return rows
    .filter((row) => row.amount < 0 && row.categoryId !== null && row.date >= start && row.date <= asOf)
    .sort((left, right) => {
      const rank = Number(preferred(right, payeeNormalized)) - Number(preferred(left, payeeNormalized));
      if (rank !== 0) {
        return rank;
      }
      if (left.date !== right.date) {
        return right.date < left.date ? -1 : 1;
      }
      return left.id < right.id ? -1 : 1;
    });
}

/** A spending row that a refund can point to. `refunded` is the sum of refunds that already point to it. */
export type RefundCandidate = {
  id: string;
  date: string;
  amount: number;
  payeeRaw: string;
  payeeNormalized: string;
  refunded: number;
};

export const refundQuestionLimit = 3;

/**
 * Purchases that a refund can point to (decision 0022): same payee key, on or up to 90 days before
 * the refund, with room left for this refund. The same amount comes first, then the most recent.
 */
export function refundCandidates(
  refund: { date: string; amount: number; payeeNormalized: string },
  purchases: readonly RefundCandidate[],
): RefundCandidate[] {
  if (refund.payeeNormalized.length === 0 || refund.amount <= 0) {
    return [];
  }
  const start = refundWindowStart(refund.date);
  const exact = (row: RefundCandidate) => row.amount === -refund.amount;
  return purchases
    .filter(
      (row) =>
        row.amount < 0 &&
        row.payeeNormalized === refund.payeeNormalized &&
        row.date >= start &&
        row.date <= refund.date &&
        row.refunded + refund.amount <= -row.amount,
    )
    .sort((left, right) => {
      const rank = Number(exact(right)) - Number(exact(left));
      if (rank !== 0) {
        return rank;
      }
      if (left.date !== right.date) {
        return right.date < left.date ? -1 : 1;
      }
      return left.id < right.id ? -1 : 1;
    });
}

/** The one purchase to link by itself: exactly one candidate has the same amount. Never a partial refund. */
export function autoRefundPurchase(
  refund: { amount: number },
  candidates: readonly RefundCandidate[],
): RefundCandidate | null {
  const same = candidates.filter((row) => row.amount === -refund.amount);
  return same.length === 1 ? (same[0] ?? null) : null;
}
