import type { InsightGroupRow, InsightRow } from "@num/shared";

/** `token` is the chart token of the slice. `dot` is the class of the same colour for the dot in the list. */
type Tone = { token: "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5" | "est"; dot: string };

const palette: Tone[] = [
  { token: "chart-1", dot: "bg-chart-1" },
  { token: "chart-2", dot: "bg-chart-2" },
  { token: "chart-3", dot: "bg-chart-3" },
  { token: "chart-4", dot: "bg-chart-4" },
  { token: "chart-5", dot: "bg-chart-5" },
];

const neutralTone: Tone = { token: "est", dot: "bg-est" };

export type SliceColor = Tone & { opacity: number };

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

function groupColor(kind: InsightRow["kind"], next: number): SliceColor {
  if (kind === "uncategorized") {
    return { ...neutralTone, opacity: 1 };
  }
  const round = Math.floor(next / palette.length);
  return { ...(palette[next % palette.length] ?? neutralTone), opacity: round === 0 ? 1 : round === 1 ? 0.6 : 0.35 };
}

function categoryColor(group: SliceColor, index: number): SliceColor {
  return { ...group, opacity: group.opacity * Math.max(0.35, 0.8 - 0.1 * index) };
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
  let next = 0;
  for (const group of shown) {
    const key = rowKey(group);
    const color = groupColor(group.kind, next);
    next += group.kind === "uncategorized" ? 0 : 1;
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
      arcs.push({ key: rowKey(category), ring: "category", groupKey: key, row: category, start: from, end: to, ofGroup: category.amount / sum, color: categoryColor(color, index) });
    });
  }
  return { arcs, colors: new Map(arcs.map((arc) => [arc.key, arc.color])) };
}
