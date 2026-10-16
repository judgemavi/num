import type { IdentityColor } from "@num/shared";

export type Hue = IdentityColor;

/** Identity colours from the design tokens. */
export const hueColor = {
  sky: { fill: "var(--color-sky-fill)", glyph: "var(--color-sky-glyph)", chart: "var(--color-sky-chart)", shades: ["var(--color-sky-1)", "var(--color-sky-2)", "var(--color-sky-3)", "var(--color-sky-4)", "var(--color-sky-5)"] },
  ocean: { fill: "var(--color-ocean-fill)", glyph: "var(--color-ocean-glyph)", chart: "var(--color-ocean-chart)", shades: ["var(--color-ocean-1)", "var(--color-ocean-2)", "var(--color-ocean-3)", "var(--color-ocean-4)", "var(--color-ocean-5)"] },
  lilac: { fill: "var(--color-lilac-fill)", glyph: "var(--color-lilac-glyph)", chart: "var(--color-lilac-chart)", shades: ["var(--color-lilac-1)", "var(--color-lilac-2)", "var(--color-lilac-3)", "var(--color-lilac-4)", "var(--color-lilac-5)"] },
  plum: { fill: "var(--color-plum-fill)", glyph: "var(--color-plum-glyph)", chart: "var(--color-plum-chart)", shades: ["var(--color-plum-1)", "var(--color-plum-2)", "var(--color-plum-3)", "var(--color-plum-4)", "var(--color-plum-5)"] },
  pink: { fill: "var(--color-pink-fill)", glyph: "var(--color-pink-glyph)", chart: "var(--color-pink-chart)", shades: ["var(--color-pink-1)", "var(--color-pink-2)", "var(--color-pink-3)", "var(--color-pink-4)", "var(--color-pink-5)"] },
  amber: { fill: "var(--color-amber-fill)", glyph: "var(--color-amber-glyph)", chart: "var(--color-amber-chart)", shades: ["var(--color-amber-1)", "var(--color-amber-2)", "var(--color-amber-3)", "var(--color-amber-4)", "var(--color-amber-5)"] },
  butter: { fill: "var(--color-butter-fill)", glyph: "var(--color-butter-glyph)", chart: "var(--color-butter-chart)", shades: ["var(--color-butter-1)", "var(--color-butter-2)", "var(--color-butter-3)", "var(--color-butter-4)", "var(--color-butter-5)"] },
  olive: { fill: "var(--color-olive-fill)", glyph: "var(--color-olive-glyph)", chart: "var(--color-olive-chart)", shades: ["var(--color-olive-1)", "var(--color-olive-2)", "var(--color-olive-3)", "var(--color-olive-4)", "var(--color-olive-5)"] },
  mint: { fill: "var(--color-mint-fill)", glyph: "var(--color-mint-glyph)", chart: "var(--color-mint-chart)", shades: ["var(--color-mint-1)", "var(--color-mint-2)", "var(--color-mint-3)", "var(--color-mint-4)", "var(--color-mint-5)"] },
  teal: { fill: "var(--color-teal-fill)", glyph: "var(--color-teal-glyph)", chart: "var(--color-teal-chart)", shades: ["var(--color-teal-1)", "var(--color-teal-2)", "var(--color-teal-3)", "var(--color-teal-4)", "var(--color-teal-5)"] },
  cyan: { fill: "var(--color-cyan-fill)", glyph: "var(--color-cyan-glyph)", chart: "var(--color-cyan-chart)", shades: ["var(--color-cyan-1)", "var(--color-cyan-2)", "var(--color-cyan-3)", "var(--color-cyan-4)", "var(--color-cyan-5)"] },
  slate: { fill: "var(--color-slate-fill)", glyph: "var(--color-slate-glyph)", chart: "var(--color-slate-chart)", shades: ["var(--color-slate-1)", "var(--color-slate-2)", "var(--color-slate-3)", "var(--color-slate-4)", "var(--color-slate-5)"] },
} satisfies Record<Hue, { fill: string; glyph: string; chart: string; shades: string[] }>;

const labels: Record<Hue, string> = {
  sky: "Sky",
  ocean: "Ocean",
  lilac: "Lilac",
  plum: "Plum",
  pink: "Pink",
  amber: "Amber",
  butter: "Butter",
  olive: "Olive",
  mint: "Mint",
  teal: "Teal",
  cyan: "Cyan",
  slate: "Slate",
};

export function colorLabel(color: Hue): string {
  return labels[color];
}

/** The colours of an icon tile, as CSS custom properties. */
export function hueVars(hue: Hue) {
  return { "--hb": hueColor[hue].fill, "--hf": hueColor[hue].glyph };
}
