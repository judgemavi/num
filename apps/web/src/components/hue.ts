import type { BucketColor } from "@num/shared";

/** The identity colours of the design (`docs/design.md`). The colour of a bucket is one of them. */
export type Hue = BucketColor;

export const hueColor: Record<Hue, { fill: string; glyph: string }> = {
  sky: { fill: "#E1F0FA", glyph: "#1F6E9E" },
  mint: { fill: "#E2F3E8", glyph: "#25734A" },
  lilac: { fill: "#EEE9FD", glyph: "#5B3FC4" },
  butter: { fill: "#FDF1CF", glyph: "#8A5B00" },
  pink: { fill: "#FCE7F1", glyph: "#A3326B" },
  teal: { fill: "#DDF3F1", glyph: "#11706A" },
};

/** The colours of an icon tile, as CSS custom properties. */
export function hueVars(hue: Hue) {
  return { "--hb": hueColor[hue].fill, "--hf": hueColor[hue].glyph };
}
