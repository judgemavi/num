import { expect, test } from "bun:test";
import { insightsSearchSchema } from "./insights";
import { searchWithDefaults } from "./list";
import { transactionListQuerySchema } from "./transaction";

const transactionSearch = searchWithDefaults(transactionListQuerySchema);
const insightsSearch = searchWithDefaults(insightsSearchSchema);

test("a value that is not valid goes back to its default, and the other values stay", () => {
  const search = transactionSearch.parse({ page: "abc", q: "coffee", needsReview: true });
  expect(search.page).toBe(1);
  expect(search.q).toBe("coffee");
  expect(search.needsReview).toBe(true);
});

test("a custom period with no dates goes back to the default period and keeps the selection", () => {
  const category = "0b5d3c8e-4a8f-4b39-9c1d-2f6f4c1d7e10";
  const search = insightsSearch.parse({ window: "custom", category });
  expect(search).toEqual({ category });
  expect("window" in search).toBe(true);
});

test("the query schema of the API still rejects the values", () => {
  expect(transactionListQuerySchema.safeParse({ page: "abc" }).success).toBe(false);
  expect(insightsSearchSchema.safeParse({ window: "custom" }).success).toBe(false);
});

test("a search that is not an object is an empty search", () => {
  expect(transactionSearch.parse(undefined).page).toBe(1);
});
