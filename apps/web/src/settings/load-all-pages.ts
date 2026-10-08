import { apiRequest } from "@/request";

type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

type Parser<T> = {
  parse: (data: unknown) => T;
};

type ListSearch = {
  archived?: boolean;
  groupId?: string;
  sort?: string;
  dir?: string;
};

export async function loadAllPages<T>(base: string, schema: Parser<Page<T>>, search: ListSearch = {}): Promise<Page<T>> {
  const items: T[] = [];
  let page = 1;
  let pageSize = 200;
  let total = 0;
  for (;;) {
    const params = new URLSearchParams();
    params.set("pageSize", "200");
    if (page !== 1) {
      params.set("page", String(page));
    }
    if (search.archived) {
      params.set("archived", "true");
    }
    if (search.groupId) {
      params.set("groupId", search.groupId);
    }
    if (search.sort) {
      params.set("sort", search.sort);
    }
    if (search.dir) {
      params.set("dir", search.dir);
    }
    const result = await apiRequest(`${base}?${params.toString()}`, schema);
    if (!result.ok) {
      throw new Error(result.code);
    }
    items.push(...result.data.items);
    pageSize = result.data.pageSize;
    total = result.data.total;
    if (items.length >= total || result.data.items.length === 0) {
      break;
    }
    page += 1;
  }
  return { items, page: 1, pageSize, total };
}
