import type { TransactionFilter, TransactionListQuery } from "@num/shared";

export function transactionPath(search: TransactionListQuery, asOf: string): string {
  const params = new URLSearchParams();
  if (search.page !== 1) {
    params.set("page", String(search.page));
  }
  if (search.pageSize !== 50) {
    params.set("pageSize", String(search.pageSize));
  }
  if (search.sort) {
    params.set("sort", search.sort);
  }
  if (search.dir) {
    params.set("dir", search.dir);
  }
  if (search.q) {
    params.set("q", search.q);
  }
  if (search.accountId) {
    params.set("accountId", search.accountId);
  }
  if (search.categoryId) {
    params.set("categoryId", search.categoryId);
  }
  if (search.groupId) {
    params.set("groupId", search.groupId);
  }
  if (search.merchantId) {
    params.set("merchantId", search.merchantId);
  }
  if (search.tagId) {
    params.set("tagId", search.tagId);
  }
  if (search.from) {
    params.set("from", search.from);
  }
  if (search.to) {
    params.set("to", search.to);
  }
  if (search.uncategorized) {
    params.set("uncategorized", "true");
  }
  if (search.automatic) {
    params.set("automatic", "true");
  }
  if (search.needsReview) {
    params.set("needsReview", "true");
    params.set("asOf", asOf);
  }
  const text = params.toString();
  return text.length === 0 ? "/api/transactions" : `/api/transactions?${text}`;
}

export function hasFilters(search: TransactionListQuery): boolean {
  return Boolean(
    search.q ||
      search.accountId ||
      search.categoryId ||
      search.groupId ||
      search.merchantId ||
      search.tagId ||
      search.from ||
      search.to ||
      search.uncategorized ||
      search.automatic ||
      search.needsReview,
  );
}

/** The filters that choose which rows a bulk approval covers. */
export function filterBody(search: TransactionListQuery): TransactionFilter {
  return {
    q: search.q,
    accountId: search.accountId,
    categoryId: search.categoryId,
    groupId: search.groupId,
    merchantId: search.merchantId,
    tagId: search.tagId,
    from: search.from,
    to: search.to,
    uncategorized: search.uncategorized,
    automatic: search.automatic,
  };
}
