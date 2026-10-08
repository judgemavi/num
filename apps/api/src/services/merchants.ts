import { merchants } from "@num/db";
import type { Merchant, MerchantListQuery } from "@num/shared";
import type { Db } from "../db";

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function compareName(left: string, right: string): number {
  const folded = compareText(left.toLowerCase(), right.toLowerCase());
  if (folded !== 0) {
    return folded;
  }
  return compareText(left, right);
}

export function listMerchants(db: Db, query: MerchantListQuery) {
  const rows = db.select({ id: merchants.id, name: merchants.name }).from(merchants).all();
  const dir = query.dir === "desc" ? -1 : 1;
  rows.sort((left, right) => {
    const field = compareName(left.name, right.name);
    if (field !== 0) {
      return field * dir;
    }
    return compareText(left.id, right.id);
  });
  const start = (query.page - 1) * query.pageSize;
  const items: Merchant[] = rows.slice(start, start + query.pageSize);
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total: rows.length,
  };
}
