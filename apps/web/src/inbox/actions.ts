import {
  bucketEventSchema,
  importReviewResultSchema,
  inboxDecisionSchema,
  inboxDecisionUndoSchema,
  inboxGroupApplyResultSchema,
  inboxUnreadableAcceptSchema,
  occurrenceLinkSchema,
  planSchema,
  transferPairSchema,
  type InboxDecisionCode,
  type InboxItem,
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
  return apiRequest("/api/inbox/groups", inboxGroupApplyResultSchema, json({
    accountId,
    transactionIds,
    excludedIds: [],
    categoryId: suggestion.transferAccountId ? null : suggestion.categoryId,
    transferAccountId: suggestion.transferAccountId,
    merchantId: suggestion.transferAccountId ? null : suggestion.merchantId,
    rule: null,
  }));
}

export function resolveReview(item: Extract<InboxItem, { kind: "import_review" }>, transactionId: string | null) {
  const body = transactionId ? { decision: "match" as const, transactionId } : { decision: "create" as const };
  return apiRequest(`/api/imports/rows/${item.importRowId}/resolve`, importReviewResultSchema, json(body));
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

export function createProposedPlan(item: Extract<InboxItem, { kind: "plan_proposal" }>, name: string) {
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

export function coverOverspent(bucketId: string, fromBucketId: string, date: string) {
  return apiRequest(`/api/buckets/${bucketId}/cover`, bucketEventSchema, json({ fromBucketId, date }));
}

export function fundFromUnassigned(bucketId: string, amount: number, asOf: string) {
  return apiRequest(`/api/buckets/${bucketId}/events?asOf=${asOf}`, bucketEventSchema, json({ kind: "fund", amount, date: asOf }));
}

export function decideItem(asOf: string, itemKey: string, decision: InboxDecisionCode) {
  return apiRequest(`/api/inbox/decisions?asOf=${asOf}`, inboxDecisionSchema, json({ itemKey, decision }));
}

export function undoDecision(itemKey: string) {
  return apiRequest("/api/inbox/decisions/undo", inboxDecisionUndoSchema, json({ itemKey }));
}

export function acceptUnreadable(asOf: string, itemKey: string) {
  return apiRequest(`/api/inbox/unreadable?asOf=${asOf}`, inboxUnreadableAcceptSchema, json({ itemKey }));
}
