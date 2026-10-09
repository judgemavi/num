import {
  accountListSchema,
  categoryGroupListSchema,
  categoryListSchema,
  currencyUpdateSchema,
  merchantListSchema,
  planListSchema,
  tagListSchema,
  transactionListSchema,
  type Account,
  type Category,
  type CategoryGroup,
  type Merchant,
  type Tag,
} from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { loadBuckets } from "@/buckets/query";
import { localAsOf } from "@/as-of";
import { apiRequest } from "@/request";
import { loadAllPages } from "@/settings/load-all-pages";

export function useBookCurrency() {
  return useQuery({
    queryKey: ["book-currency"],
    queryFn: async () => {
      const result = await apiRequest("/api/settings/currency", currencyUpdateSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.currency;
    },
  });
}

async function activeAndArchived<T extends { id: string }>(
  base: string,
  schema: { parse: (data: unknown) => { items: T[]; page: number; pageSize: number; total: number } },
): Promise<T[]> {
  const active = await loadAllPages(base, schema, { archived: false });
  const archived = await loadAllPages(base, schema, { archived: true });
  return [...active.items, ...archived.items];
}

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts", "options"],
    queryFn: () => activeAndArchived<Account>("/api/accounts", accountListSchema),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories", "options"],
    queryFn: () => activeAndArchived<Category>("/api/categories", categoryListSchema),
  });
}

export function useTags() {
  return useQuery({
    queryKey: ["tags", "options"],
    queryFn: () => activeAndArchived<Tag>("/api/tags", tagListSchema),
  });
}

export function useMerchants() {
  return useQuery({
    queryKey: ["merchants", "options"],
    queryFn: () => activeAndArchived<Merchant>("/api/merchants", merchantListSchema),
  });
}

export function useGroups() {
  return useQuery({
    queryKey: ["category-groups"],
    queryFn: async () => {
      const result = await apiRequest("/api/category-groups", categoryGroupListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.items as CategoryGroup[];
    },
  });
}

export function useActiveBuckets() {
  return useQuery({
    queryKey: ["buckets", "editor"],
    queryFn: () => loadBuckets({ archived: false, sort: "name", dir: "asc" }),
  });
}

export function useRecord<T>(key: string, id: string | null, path: string, schema: { parse: (data: unknown) => T }) {
  return useQuery({
    queryKey: [key, id],
    enabled: id !== null,
    queryFn: async () => {
      const result = await apiRequest(path, schema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });
}

/** The Needs review total and level counts. The shell and Home share this one query. */
export function useReviewSummary() {
  const asOf = localAsOf();
  return useQuery({
    queryKey: ["needs-review", asOf],
    queryFn: async () => {
      const result = await apiRequest(`/api/transactions?needsReview=true&asOf=${asOf}&pageSize=1`, transactionListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return { total: result.data.total, counts: result.data.reviewCounts };
    },
  });
}

export function useActivePlans() {
  return useQuery({
    queryKey: ["plans", "active"],
    queryFn: () => loadAllPages("/api/recurring", planListSchema, { archived: false, sort: "name", dir: "asc" }),
  });
}
