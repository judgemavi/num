import type { TransactionFilter, TransactionListQuery } from "@num/shared";

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
