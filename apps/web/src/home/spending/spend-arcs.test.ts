import type { InsightGroupRow, InsightRow } from "@num/shared";
import { expect, test } from "bun:test";
import { spendArcs } from "./spend-arcs";

function item(id: string, amount: number): InsightRow {
  return { id, kind: "item", amount, inflow: null };
}

function group(id: string, categories: InsightRow[]): InsightGroupRow {
  return { ...item(id, categories.reduce((sum, row) => sum + row.amount, 0)), categories };
}

test("category arcs fill the arc of their group, also when a refund makes the group total smaller", () => {
  const groups = [
    group("g1", [item("c1", 75_000), item("c2", 25_000), item("c3", -20_000)]),
    group("g2", [item("c4", 20_000)]),
    { id: null, kind: "uncategorized" as const, amount: 25_000, inflow: 0, categories: [] },
    group("g3", [item("c5", -5_000)]),
  ];
  const { arcs } = spendArcs(groups);
  expect(arcs.filter((arc) => arc.ring === "group").map((arc) => arc.row.id)).toEqual(["g1", "g2", null]);
  for (const parent of arcs.filter((arc) => arc.ring === "group")) {
    const children = arcs.filter((arc) => arc.ring === "category" && arc.groupKey === parent.key);
    if (parent.row.kind === "uncategorized") {
      expect(children).toEqual([]);
      continue;
    }
    expect(children[0]?.start).toBeCloseTo(parent.start, 10);
    expect(children.at(-1)?.end).toBeCloseTo(parent.end, 10);
    expect(children.map((arc) => arc.row.id)).not.toContain("c3");
  }
  expect(arcs.at(-1)?.end).toBeCloseTo(1, 10);
});
