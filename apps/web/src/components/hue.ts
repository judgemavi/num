export const hueNames = ["sky", "mint", "lilac", "butter", "pink", "teal"] as const;

export type Hue = (typeof hueNames)[number];

export const hueColor: Record<Hue, { fill: string; glyph: string }> = {
  sky: { fill: "#E1F0FA", glyph: "#1F6E9E" },
  mint: { fill: "#E2F3E8", glyph: "#25734A" },
  lilac: { fill: "#EEE9FD", glyph: "#5B3FC4" },
  butter: { fill: "#FDF1CF", glyph: "#8A5B00" },
  pink: { fill: "#FCE7F1", glyph: "#A3326B" },
  teal: { fill: "#DDF3F1", glyph: "#11706A" },
};

export function hueVars(hue: Hue): Record<"--hb" | "--hf", string> {
  return { "--hb": hueColor[hue].fill, "--hf": hueColor[hue].glyph };
}
