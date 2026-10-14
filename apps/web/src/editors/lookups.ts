import { usePrefetchQuery, useSuspenseQuery } from "@tanstack/react-query";
import { accountOptionsQuery } from "@/api/accounts";
import { activeBucketsQuery } from "@/api/buckets";
import { categoryOptionsQuery, groupListQuery } from "@/api/categories";
import { merchantOptionsQuery } from "@/api/merchants";
import { activePlansQuery } from "@/api/recurring";
import { bookCurrencyQuery } from "@/api/settings";
import { tagOptionsQuery } from "@/api/tags";
import { accountLabel } from "@/accounts/label";

/**
 * The lists that many screens and editors use. Each hook below suspends until its list has data.
 * The shell calls this hook, which starts the reads together. Thus a component that calls more than one of the hooks
 * does not wait for one read before the next read starts.
 */
export function useStartSharedLists() {
  usePrefetchQuery(bookCurrencyQuery());
  usePrefetchQuery(accountOptionsQuery());
  usePrefetchQuery(categoryOptionsQuery());
  usePrefetchQuery(tagOptionsQuery());
  usePrefetchQuery(merchantOptionsQuery());
  usePrefetchQuery(groupListQuery());
  usePrefetchQuery(activeBucketsQuery());
  usePrefetchQuery(activePlansQuery());
}

export function useBookCurrency() {
  return useSuspenseQuery(bookCurrencyQuery()).data;
}

export function useAccounts() {
  return useSuspenseQuery(accountOptionsQuery()).data;
}

export function useCategories() {
  return useSuspenseQuery(categoryOptionsQuery()).data;
}

export function useTags() {
  return useSuspenseQuery(tagOptionsQuery()).data;
}

export function useMerchants() {
  return useSuspenseQuery(merchantOptionsQuery()).data;
}

export function useGroups() {
  return useSuspenseQuery(groupListQuery()).data;
}

export function useActiveBuckets() {
  return useSuspenseQuery(activeBucketsQuery()).data;
}

export function useActivePlans() {
  return useSuspenseQuery(activePlansQuery()).data;
}

/**
 * Make a function that gives one result for one list. The components that read the same list from the cache get the
 * same result. Thus the map of a list is made one time, and a component renders again only when the list changes.
 */
function oncePerList<Item, Result>(make: (items: readonly Item[]) => Result) {
  const made = new WeakMap<readonly Item[], Result>();
  return (items: readonly Item[]): Result => {
    const found = made.get(items);
    if (found !== undefined) {
      return found;
    }
    const result = make(items);
    made.set(items, result);
    return result;
  };
}

const namesById = oncePerList((items: readonly { id: string; name: string }[]) => new Map(items.map((item) => [item.id, item.name])));
const labelsById = oncePerList((items: readonly { id: string; name: string; institution: string | null }[]) => new Map(items.map((item) => [item.id, accountLabel(item)])));

/** The name of each category, by id. Active and archived. */
export function useCategoryNames() {
  return useSuspenseQuery({ ...categoryOptionsQuery(), select: namesById }).data;
}

/** The name of each merchant, by id. Active and archived. */
export function useMerchantNames() {
  return useSuspenseQuery({ ...merchantOptionsQuery(), select: namesById }).data;
}

/** The name of each tag, by id. Active and archived. */
export function useTagNames() {
  return useSuspenseQuery({ ...tagOptionsQuery(), select: namesById }).data;
}

/** The name of each category group, by id. */
export function useGroupNames() {
  return useSuspenseQuery({ ...groupListQuery(), select: namesById }).data;
}

/** The display name of each account, by id. Active and archived. */
export function useAccountLabels() {
  return useSuspenseQuery({ ...accountOptionsQuery(), select: labelsById }).data;
}

/** The name of each active bucket, by id. */
export function useBucketNames() {
  return useSuspenseQuery({ ...activeBucketsQuery(), select: (board) => namesById(board.items) }).data;
}
