import type { InsightGroupRow, InsightRow } from "@num/shared";
import { expect, test } from "bun:test";
import { spendArcs } from "./spend-arcs";

function item(id: string, amount: number): InsightRow {
  return { id, kind: "item", amount, inflow: null };
}

function group(id: string, categories: InsightRow[]): InsightGroupRow {
  return { ...item(id, categories.reduce((sum, row) => sum + row.amount, 0)), color: "sky", categories };
}

test("category arcs fill the arc of their group, also when a refund makes the group total smaller", () => {
  const groups = [
    group("g1", [item("c1", 75_000), item("c2", 25_000), item("c3", -20_000)]),
    group("g2", [item("c4", 20_000)]),
    { id: null, kind: "uncategorized" as const, amount: 25_000, inflow: 0, color: null, categories: [] },
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

test("category shades follow the group colour and repeat after five", () => {
  const rows = Array.from({ length: 7 }, (_, index) => item(`c${index}`, 10_000 - index * 100));
  const { arcs, colors } = spendArcs([{ ...group("g1", rows), color: "ocean" }]);
  expect(arcs[0]?.color.value).toBe("var(--color-ocean-chart)");
  expect(arcs.filter((arc) => arc.ring === "category").map((arc) => arc.color.value)).toEqual([
    "var(--color-ocean-1)", "var(--color-ocean-2)", "var(--color-ocean-3)", "var(--color-ocean-4)", "var(--color-ocean-5)", "var(--color-ocean-1)", "var(--color-ocean-2)",
  ]);
  for (const arc of arcs) expect(colors.get(arc.key)).toEqual(arc.color);
});

test("group colours stay fixed when spending changes their order", () => {
  const sky = group("g1", [item("c1", 10_000)]);
  const pink = { ...group("g2", [item("c2", 20_000)]), color: "pink" as const };
  const first = spendArcs([pink, sky]).colors;
  const second = spendArcs([sky, pink]).colors;
  expect(first).toEqual(second);
  expect(first.get("item-g2")?.value).toBe("var(--color-pink-chart)");
});
