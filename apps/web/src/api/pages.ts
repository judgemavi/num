type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

export const fullPage = 200;

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

/** Read the active records and then the archived records of a list. */
export async function activeAndArchived<T>(load: (search: { archived: boolean }) => Promise<{ items: T[] }>): Promise<T[]> {
  const active = await load({ archived: false });
  const archived = await load({ archived: true });
  return [...active.items, ...archived.items];
}
