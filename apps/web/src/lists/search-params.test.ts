import { expect, test } from "bun:test";
import { parseSearch, stringifySearch } from "./search-params";

test("a number is text in the URL, with no quotes", () => {
  expect(stringifySearch({ window: "12", page: 2 })).toBe("?window=12&page=2");
  expect(parseSearch("?window=12&page=2")).toEqual({ window: "12", page: "2" });
});

test("flags read back as booleans, and text that looks like a flag keeps its quotes", () => {
  expect(parseSearch(stringifySearch({ uncategorized: true, q: "true" }))).toEqual({ uncategorized: true, q: "true" });
});

test("text reads back as the same text", () => {
  for (const q of ["coffee shop", "12", "\"quoted\"", "[x]", "{", "2026-01-31", "a&b=c"]) {
    expect(parseSearch(stringifySearch({ q }))).toEqual({ q });
  }
});

test("an old link with a quoted number reads as text, and no values give no search", () => {
  expect(parseSearch("?q=%2212%22")).toEqual({ q: "12" });
  expect(stringifySearch({ q: undefined })).toBe("");
});
