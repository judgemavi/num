import type { InsightRow } from "@num/shared";

type Tone = { fill: string; stroke: string; dot: string };

const palette: Tone[] = [
  { fill: "fill-chart-1", stroke: "stroke-chart-1", dot: "bg-chart-1" },
  { fill: "fill-chart-2", stroke: "stroke-chart-2", dot: "bg-chart-2" },
  { fill: "fill-chart-3", stroke: "stroke-chart-3", dot: "bg-chart-3" },
  { fill: "fill-chart-4", stroke: "stroke-chart-4", dot: "bg-chart-4" },
  { fill: "fill-chart-5", stroke: "stroke-chart-5", dot: "bg-chart-5" },
];

export const neutralTone: Tone = { fill: "fill-est", stroke: "stroke-est", dot: "bg-est" };

export type SliceColor = Tone & { opacity: number };

export function rowKey(row: InsightRow): string {
  return `${row.kind}-${row.id ?? ""}`;
}

/** One colour for each row with spending above zero. Rows at zero or less are not slices. */
export function sliceColors(rows: readonly InsightRow[]): Map<string, SliceColor> {
  const colors = new Map<string, SliceColor>();
  let next = 0;
  for (const row of rows) {
    if (row.amount <= 0) {
      continue;
    }
    if (row.kind === "uncategorized") {
      colors.set(rowKey(row), { ...neutralTone, opacity: 1 });
      continue;
    }
    const round = Math.floor(next / palette.length);
    const tone = palette[next % palette.length] ?? neutralTone;
    colors.set(rowKey(row), { ...tone, opacity: round === 0 ? 1 : round === 1 ? 0.6 : 0.35 });
    next += 1;
  }
  return colors;
}
