import { expect, test } from "bun:test";
import { comparePriority } from "./bucket";

test("buckets with the same priority are in the order: commitment first, then the id", () => {
  const same = (id: string, kind: "commitment" | "emergency") => ({ id, kind, priority: 0 });
  const sorted = [same("b", "emergency"), same("z", "commitment"), same("a", "emergency"), same("c", "commitment")].sort(comparePriority);
  expect(sorted.map((item) => item.id)).toEqual(["c", "z", "a", "b"]);
  expect(comparePriority({ id: "z", kind: "commitment", priority: 1 }, { id: "a", kind: "emergency", priority: 0 })).toBeGreaterThan(0);
});
