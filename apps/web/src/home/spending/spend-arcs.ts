import type { InsightGroupRow, InsightRow } from "@num/shared";

import { hueColor } from "@/components/hue";

export type SliceColor = { value: string };

export type Arc = {
  key: string;
  ring: "group" | "category";
  groupKey: string;
  row: InsightRow;
  /** Start and end of the arc as a share of the full turn. */
  start: number;
  end: number;
  /** The share of the category in the positive categories of its group. It is null for a group. */
  ofGroup: number | null;
  color: SliceColor;
};

export function rowKey(row: InsightRow): string {
  return `${row.kind}-${row.id ?? ""}`;
}

function groupColor(group: InsightGroupRow): SliceColor {
  return { value: group.kind === "uncategorized" ? "var(--est)" : hueColor[group.color ?? "slate"].chart };
}

export function categoryColor(group: InsightGroupRow, index: number): SliceColor {
  const palette = hueColor[group.color ?? "slate"];
  return { value: palette.shades[index % palette.shades.length] ?? palette.chart };
}

/**
 * The arcs of the two rings and the colour of each row with spending above zero.
 * A category arc lies inside the arc of its group. A group with a refund can have positive categories
 * that add up to more than its net spending. Thus the category arcs share the span of the group in proportion
 * to the positive amounts of the categories. Rows at zero or less are not arcs.
 */
export function spendArcs(groups: readonly InsightGroupRow[]) {
  const shown = groups.filter((group) => group.amount > 0);
  const total = shown.reduce((sum, group) => sum + group.amount, 0);
  const arcs: Arc[] = [];
  let used = 0;
  const colors = new Map<string, SliceColor>();
  for (const group of groups) {
    colors.set(rowKey(group), groupColor(group));
    group.categories.forEach((category, index) => colors.set(rowKey(category), categoryColor(group, index)));
  }
  for (const group of shown) {
    const key = rowKey(group);
    const color = groupColor(group);
    const start = used / total;
    used += group.amount;
    const end = used / total;
    arcs.push({ key, ring: "group", groupKey: key, row: group, start, end, ofGroup: null, color });
    const positive = group.categories.filter((category) => category.amount > 0);
    const sum = positive.reduce((acc, category) => acc + category.amount, 0);
    let inside = 0;
    positive.forEach((category, index) => {
      const from = start + ((end - start) * inside) / sum;
      inside += category.amount;
      const to = start + ((end - start) * inside) / sum;
      arcs.push({ key: rowKey(category), ring: "category", groupKey: key, row: category, start: from, end: to, ofGroup: category.amount / sum, color: categoryColor(group, index) });
    });
  }
  return { arcs, colors };
}
