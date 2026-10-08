import type { PlanListQuery } from "@num/shared";

export function planPath(search: PlanListQuery): string {
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
  if (search.q) {
    params.set("q", search.q);
  }
  if (search.kind) {
    params.set("kind", search.kind);
  }
  if (search.accountId) {
    params.set("accountId", search.accountId);
  }
  if (search.archived) {
    params.set("archived", "true");
  }
  params.set("pageSize", "200");
  const text = params.toString();
  return `/api/recurring?${text}`;
}
