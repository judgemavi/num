import {
  inboxDecisionSchema,
  inboxDecisionUndoSchema,
  inboxGroupApplyResultSchema,
  occurrenceLinkSchema,
  planSchema,
  transactionSchema,
  transferPairSchema,
  type InboxDecisionCode,
  type Plan,
  type Suggestion,
} from "@num/shared";
import { apiRequest } from "@/request";

function json(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function applyInboxGroup(accountId: string, transactionIds: string[], suggestion: Suggestion) {
  return apiRequest("/api/transactions/group", inboxGroupApplyResultSchema, json({
    accountId,
    transactionIds,
    excludedIds: [],
    categoryId: suggestion.transferAccountId ? null : suggestion.categoryId,
    transferAccountId: suggestion.transferAccountId,
    merchantId: suggestion.transferAccountId ? null : suggestion.merchantId,
  }));
}

/** Link a refund to a purchase. One update of the transaction, so the link is one audited write. */
export async function linkRefund(refundId: string, purchaseId: string): Promise<{ ok: boolean }> {
  const current = await apiRequest(`/api/transactions/${refundId}`, transactionSchema);
  if (!current.ok) {
    return { ok: false };
  }
  const { data } = current;
  return apiRequest(`/api/transactions/${refundId}`, transactionSchema, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      accountId: data.accountId,
      date: data.date,
      amount: data.amount,
      merchantId: data.merchantId,
      notes: data.notes,
      payeeRaw: data.payeeRaw,
      status: data.status,
      lines: data.lines.map((line) => ({
        amount: line.amount,
        memo: line.memo,
        categoryId: line.categoryId,
        transferAccountId: line.transferAccountId,
        tagIds: line.tagIds,
      })),
      refundOfId: purchaseId,
    }),
  });
}

export function updatePlanAmount(plan: Plan, expectedAmount: number) {
  return apiRequest(`/api/recurring/${plan.id}`, planSchema, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: plan.name,
      kind: plan.kind,
      accountId: plan.accountId,
      expectedAmount,
      tolerance: plan.tolerance,
      amountMode: plan.amountMode,
      categoryId: plan.categoryId,
      transferAccountId: plan.transferAccountId,
      merchantId: plan.merchantId,
      startDate: plan.startDate,
      freq: plan.freq,
      interval: plan.interval,
      monthDay: plan.monthDay,
      businessDayShift: plan.businessDayShift,
      endDate: plan.endDate,
      active: plan.active,
      fundsBuckets: plan.fundsBuckets,
    }),
  });
}

export function linkOccurrence(planId: string, dueDate: string, transactionId: string) {
  return apiRequest(
    `/api/recurring/${planId}/occurrences/${dueDate}/link`,
    occurrenceLinkSchema,
    json({ transactionId }),
  );
}

export function createProposedPlan(
  item: {
    accountId: string;
    merchantId: string;
    expectedAmount: number;
    tolerance: number;
    amountMode: "fixed" | "variable";
    startDate: string;
    freq: "weekly" | "monthly" | "yearly";
    interval: number;
    monthDay: number | null;
  },
  name: string,
) {
  const body = {
    name,
    kind: item.expectedAmount < 0 ? "bill" : "income",
    accountId: item.accountId,
    expectedAmount: item.expectedAmount,
    tolerance: item.tolerance,
    amountMode: item.amountMode,
    categoryId: null,
    transferAccountId: null,
    merchantId: item.merchantId,
    startDate: item.startDate,
    freq: item.freq,
    interval: item.interval,
    monthDay: item.monthDay,
    businessDayShift: "none",
    endDate: null,
    active: true,
    fundsBuckets: false,
  };
  return apiRequest("/api/recurring", planSchema, json(body));
}

export function acceptPair(asOf: string, leftId: string, rightId: string) {
  return apiRequest(`/api/transfer-pairs?asOf=${asOf}`, transferPairSchema, json({ leftId, rightId }));
}

export function decideItem(asOf: string, itemKey: string, decision: InboxDecisionCode) {
  return apiRequest(`/api/review/decisions?asOf=${asOf}`, inboxDecisionSchema, json({ itemKey, decision }));
}

export function undoDecision(itemKey: string) {
  return apiRequest("/api/review/decisions/undo", inboxDecisionUndoSchema, json({ itemKey }));
}
