import type { ImportViewQuery } from "@num/shared";

export function importViewPath(search: ImportViewQuery): string {
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
  if (search.accountId) {
    params.set("accountId", search.accountId);
  }
  if (search.status) {
    params.set("status", search.status);
  }
  if (search.from) {
    params.set("from", search.from);
  }
  if (search.to) {
    params.set("to", search.to);
  }
  const text = params.toString();
  return text.length === 0 ? "/api/imports" : `/api/imports?${text}`;
}
