import type { sortDirections } from "@num/shared";

type Direction = (typeof sortDirections)[number];

/** A sort order of a list: a column of the list query schema and a direction. */
export type SortChoice<Column extends string> = { sort: Column; dir: Direction };

/** The time that the search box waits before it changes the URL. */
export const searchDelayMs = 300;

/**
 * The sort order that the list shows. The URL has no sort order when the list has its default sort order.
 * A URL with a column and no direction is in ascending order.
 */
export function sortOf<Column extends string>(search: { sort?: Column; dir?: Direction }, fallback: SortChoice<Column>): SortChoice<Column> {
  return {
    sort: search.sort ?? fallback.sort,
    dir: search.dir ?? (search.sort === undefined ? fallback.dir : "asc"),
  };
}

/** The sort values for the URL. The default sort order is not written to the URL. */
export function sortParams<Column extends string>(choice: SortChoice<Column>, fallback: SortChoice<Column>) {
  return choice.sort === fallback.sort && choice.dir === fallback.dir ? { sort: undefined, dir: undefined } : { sort: choice.sort, dir: choice.dir };
}

/**
 * The sort order after a click on a column header. A second click on the sorted column turns the direction.
 * A new column starts in ascending order. The default column starts in its default direction.
 */
export function columnSort<Column extends string>(current: SortChoice<Column>, column: Column, fallback: SortChoice<Column>): SortChoice<Column> {
  if (current.sort === column) {
    return { sort: column, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { sort: column, dir: column === fallback.sort ? fallback.dir : "asc" };
}

/** The value of one sort order in a sort control. */
export function sortKey(choice: SortChoice<string>) {
  return `${choice.sort}:${choice.dir}`;
}

/** The number of the last page. A list with no rows has one page. */
export function lastPageOf(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** The search text for the URL. Text that is empty or only spaces is no search. */
export function queryText(text: string) {
  const trimmed = text.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/** The sort orders of a list that sorts only by name. */
export const nameSortOptions = [
  { sort: "name", dir: "asc", label: "Name, A to Z" },
  { sort: "name", dir: "desc", label: "Name, Z to A" },
] as const;
