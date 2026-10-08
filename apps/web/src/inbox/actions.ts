import {
  bucketEventSchema,
  importReviewResultSchema,
  inboxRestoreSchema,
  occurrenceLinkSchema,
  planSchema,
  ruleSchema,
  transactionSchema,
  transferPairSchema,
  type InboxItem,
  type Plan,
  type Transaction,
} from "@num/shared";
import { apiRequest, type ApiResult } from "@/request";

function json(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function saveCategory(
  transactionId: string,
  lineId: string,
  categoryId: string,
  merchantId: string | null,
): Promise<ApiResult<Transaction>> {
  const current = await apiRequest(`/api/transactions/${transactionId}`, transactionSchema);
  if (!current.ok) {
    return current;
  }
  const txn = current.data;
  return apiRequest(`/api/transactions/${transactionId}`, transactionSchema, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      accountId: txn.accountId,
      date: txn.date,
      amount: txn.amount,
      payeeRaw: txn.payeeRaw,
      merchantId: txn.merchantId ?? merchantId,
      notes: txn.notes,
      status: txn.status === "cleared" ? "cleared" : "open",
      lines: txn.lines.map((line) => ({
        amount: line.amount,
        memo: line.memo,
        categoryId: line.id === lineId ? categoryId : line.categoryId,
        transferAccountId: line.transferAccountId,
        tagIds: line.tagIds,
      })),
    }),
  });
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

export function skipOccurrence(planId: string, dueDate: string, reason: string) {
  return apiRequest(`/api/recurring/${planId}/occurrences/${dueDate}/skip`, occurrenceLinkSchema, json({ reason }));
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

export function promoteRule(payee: string, merchantId: string, categoryId: string) {
  return apiRequest("/api/promotions", ruleSchema, json({ payee, merchantId, categoryId }));
}

export function coverOverspent(bucketId: string, fromBucketId: string, date: string) {
  return apiRequest(`/api/buckets/${bucketId}/cover`, bucketEventSchema, json({ fromBucketId, date }));
}

export function fundFromUnassigned(bucketId: string, amount: number, asOf: string) {
  return apiRequest(`/api/buckets/${bucketId}/events?asOf=${asOf}`, bucketEventSchema, json({ kind: "fund", amount, date: asOf }));
}

export function dismissItem(asOf: string, itemKey: string, reason: string) {
  return apiRequest(`/api/inbox/dismissals?asOf=${asOf}`, inboxRestoreSchema, json({ itemKey, reason }));
}

export function restoreItem(itemKey: string) {
  return apiRequest("/api/inbox/dismissals/restore", inboxRestoreSchema, json({ itemKey }));
}
