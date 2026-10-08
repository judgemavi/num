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

export async function loadAllPages<T>(base: string, schema: Parser<Page<T>>, archived: boolean): Promise<Page<T>> {
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
    if (archived) {
      params.set("archived", "true");
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
