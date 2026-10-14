export function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

export function pageOf<T>(rows: readonly T[], query: { page: number; pageSize: number }) {
  const start = (query.page - 1) * query.pageSize;
  return {
    items: rows.slice(start, start + query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    total: rows.length,
  };
}
