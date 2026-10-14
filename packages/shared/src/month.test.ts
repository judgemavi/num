import { expect, test } from "bun:test";
import { completeMonths } from "./month";

test("complete months are the last months that ended before asOf, oldest first", () => {
  expect(completeMonths("2026-04-15", "2025-01-10", 3)).toEqual(["2026-01", "2026-02", "2026-03"]);
  expect(completeMonths("2026-04-01", "2025-01-10", 3)).toEqual(["2026-01", "2026-02", "2026-03"]);
});

test("the month of asOf is not complete, also on its last day", () => {
  expect(completeMonths("2026-03-31", "2025-01-10", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  expect(completeMonths("2026-01-31", "2025-01-10", 1)).toEqual(["2025-12"]);
});

test("months before the month of the first transaction are not complete months", () => {
  expect(completeMonths("2026-04-15", "2026-02-20", 3)).toEqual(["2026-02", "2026-03"]);
  expect(completeMonths("2026-04-15", "2026-04-02", 3)).toEqual([]);
  expect(completeMonths("2026-04-15", "2026-06-01", 3)).toEqual([]);
  expect(completeMonths("2026-04-15", null, 3)).toEqual([]);
});
