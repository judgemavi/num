type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

export const fullPage = 200;

/**
 * The filters and the sort order of a list that the app reads in full. The page and the page size are not a part of
 * the read: the app reads all pages.
 */
export type ListFilters<Query> = Partial<Omit<Query, "page" | "pageSize">>;

/** Read all pages of a list. The result has all items and the other fields of the last page. */
export async function allPages<T, P extends Page<T>>(load: (page: number) => Promise<P>): Promise<P> {
  const items: T[] = [];
  for (let page = 1; ; page += 1) {
    const result = await load(page);
    items.push(...result.items);
    if (items.length >= result.total || result.items.length === 0) {
      return { ...result, items, page: 1 };
    }
  }
}

/**
 * Read the active records and then the archived records of a list. `read` gets each list through the query cache,
 * thus a screen that shows one of the two lists and this read share one request.
 */
export async function activeAndArchived<T>(read: (archived: boolean) => Promise<{ items: T[] }>): Promise<T[]> {
  const active = await read(false);
  const archived = await read(true);
  return [...active.items, ...archived.items];
}
