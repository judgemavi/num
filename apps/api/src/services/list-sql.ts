import { asc, count, desc, type SQL } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Reader } from "./write";

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
  const { sortKey, ...rest } = row;
  return rest;
}
