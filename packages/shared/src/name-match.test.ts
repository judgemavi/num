import { expect, test } from "bun:test";
import { archivedNameMatch } from "./name-match";

test("an archived name match offers that record, and an active name does not", () => {
  const archived = [
    { id: "b", name: "Blue Bottle" },
    { id: "a", name: "blue bottle" },
  ];
  expect(archivedNameMatch("  BLUE BOTTLE ", [], archived)).toEqual({ id: "a", name: "blue bottle" });
  expect(archivedNameMatch("blue bottle", ["Blue Bottle"], archived)).toBeNull();
  expect(archivedNameMatch("Cafe", [], archived)).toBeNull();
  expect(archivedNameMatch("   ", [], archived)).toBeNull();
});
