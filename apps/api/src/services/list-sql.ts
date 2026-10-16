import { accounts, buckets, categories, categoryGroups, merchants, tags } from "@num/db";
import type { ErrorCode } from "@num/shared";
import { asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { ServiceError } from "../service-error";
import { withoutId, type Reader, type WriteTx } from "./write";

type Direction = "asc" | "desc" | undefined;

function directed(dir: Direction) {
  return dir === "desc" ? desc : asc;
}

/** Order by the folded name, then the name, then the id. The direction applies to the name. The id is always ascending. */
export function byName(table: { sortKey: SQLiteColumn; name: SQLiteColumn; id: SQLiteColumn }, dir: Direction) {
  const order = directed(dir);
  return [order(table.sortKey), order(table.name), asc(table.id)];
}

/** Order by one column, then the id. The direction applies to the column. The id is always ascending. */
export function byColumn(column: SQLiteColumn, id: SQLiteColumn, dir: Direction) {
  return [directed(dir)(column), asc(id)];
}

/** The window of one page for `limit` and `offset`. */
export function windowOf(query: { page: number; pageSize: number }) {
  return { limit: query.pageSize, offset: (query.page - 1) * query.pageSize };
}

/** The number of rows of `table` that match `where`. */
export function totalOf(db: Reader, table: SQLiteTable, where: SQL | undefined): number {
  return db.select({ total: count() }).from(table).where(where).get()?.total ?? 0;
}

/** A page with the paging fields of the list response. */
export function pagedOf<T>(items: T[], total: number, query: { page: number; pageSize: number }) {
  return { items, page: query.page, pageSize: query.pageSize, total };
}

/** The sort key is for the database. The API and the audit log do not show it. */
export function withoutSortKey<T extends { sortKey: string }>(row: T): Omit<T, "sortKey">;
export function withoutSortKey<T extends { sortKey: string }>(row: T | undefined): Omit<T, "sortKey"> | undefined;
export function withoutSortKey<T extends { sortKey: string }>(row: T | undefined) {
  if (!row) {
    return undefined;
  }
  const { sortKey: _sortKey, ...rest } = row;
  return rest;
}

/** One SQL parameter for a list of ids or names, including an empty list. */
export function idIn(column: SQLiteColumn, ids: readonly string[]) {
  return sql`${column} in (select value from json_each(${JSON.stringify(ids)}))`;
}

export function assertUniqueName(
  tx: WriteTx,
  table: typeof tags | typeof merchants | typeof categories | typeof categoryGroups,
  name: string,
  code: ErrorCode,
  exceptId?: string,
) {
  const row = tx.select({ id: table.id }).from(table).where(sql`lower(${table.name}) = lower(${name})`).get();
  if (row && row.id !== exceptId) throw new ServiceError(code, 409);
}

const archiveErrors = {
  tags: ["tag_archived", "tag_not_archived"],
  merchants: ["merchant_archived", "merchant_not_archived"],
  categories: ["category_archived", "category_not_archived"],
  buckets: ["bucket_archived", "bucket_not_archived"],
  accounts: ["account_archived", "account_not_archived"],
} as const;

/** The caller keeps its checks and return mapping in the same write transaction. */
export function setArchived<T extends { id: string; archivedAt: string | null }>(
  tx: WriteTx,
  table: typeof tags | typeof merchants | typeof categories | typeof buckets | typeof accounts,
  existing: T,
  entity: keyof typeof archiveErrors,
  archivedAt: string | null,
  options?: { beforeChange?: () => void; snapshot?: (row: T) => unknown },
) {
  const archive = archivedAt !== null;
  if (archive === (existing.archivedAt !== null)) {
    throw new ServiceError(archiveErrors[entity][archive ? 0 : 1], 409);
  }
  const snapshot = options?.snapshot ?? withoutId;
  const before = snapshot(existing);
  options?.beforeChange?.();
  const next = { ...existing, archivedAt };
  tx.update(table).set({ archivedAt }).where(eq(table.id, existing.id)).run();
  tx.audit({ entity, entityId: existing.id, action: archive ? "archive" : "restore", before, after: snapshot(next) });
  return next;
}
