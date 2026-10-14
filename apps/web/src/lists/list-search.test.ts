import { describe, expect, test } from "bun:test";
import { columnSort, lastPageOf, queryText, sortKey, sortOf, sortParams, type SortChoice } from "./list-search";

type Column = "date" | "amount" | "payeeRaw";

const newest: SortChoice<Column> = { sort: "date", dir: "desc" };

describe("list search", () => {
  test("a URL with no sort order shows the default sort order", () => {
    expect(sortOf<Column>({}, newest)).toEqual(newest);
  });

  test("a URL with a column and no direction is in ascending order", () => {
    expect(sortOf<Column>({ sort: "amount" }, newest)).toEqual({ sort: "amount", dir: "asc" });
    expect(sortOf<Column>({ sort: "date" }, newest)).toEqual({ sort: "date", dir: "asc" });
    expect(sortOf<Column>({ sort: "amount", dir: "desc" }, newest)).toEqual({ sort: "amount", dir: "desc" });
  });

  test("the default sort order is not written to the URL", () => {
    expect(sortParams(newest, newest)).toEqual({ sort: undefined, dir: undefined });
    expect(sortParams<Column>({ sort: "date", dir: "asc" }, newest)).toEqual({ sort: "date", dir: "asc" });
    expect(sortParams<Column>({ sort: "payeeRaw", dir: "desc" }, newest)).toEqual({ sort: "payeeRaw", dir: "desc" });
  });

  test("a click on the sorted column turns the direction", () => {
    expect(columnSort(newest, "date", newest)).toEqual({ sort: "date", dir: "asc" });
    expect(columnSort<Column>({ sort: "amount", dir: "asc" }, "amount", newest)).toEqual({ sort: "amount", dir: "desc" });
  });

  test("a click on a new column starts in ascending order, and the default column starts in its default direction", () => {
    expect(columnSort(newest, "payeeRaw", newest)).toEqual({ sort: "payeeRaw", dir: "asc" });
    expect(columnSort<Column>({ sort: "amount", dir: "desc" }, "date", newest)).toEqual(newest);
  });

  test("each sort order has a different key", () => {
    expect(sortKey(newest)).toBe("date:desc");
    expect(sortKey({ sort: "date", dir: "asc" })).not.toBe(sortKey(newest));
  });

  test("the last page of a list", () => {
    expect(lastPageOf(0, 50)).toBe(1);
    expect(lastPageOf(50, 50)).toBe(1);
    expect(lastPageOf(51, 50)).toBe(2);
    expect(lastPageOf(120, 50)).toBe(3);
  });

  test("search text that is empty or only spaces is no search", () => {
    expect(queryText("")).toBe(undefined);
    expect(queryText("   ")).toBe(undefined);
    expect(queryText(" tea ")).toBe("tea");
  });
});
