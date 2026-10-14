import type { TransactionFilter } from "@num/shared";

export function hasFilters(search: TransactionFilter): boolean {
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
      search.automatic,
  );
}
