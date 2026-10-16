export const identityColors = ["sky", "ocean", "lilac", "plum", "pink", "amber", "butter", "olive", "mint", "teal", "cyan", "slate"] as const;

export type IdentityColor = (typeof identityColors)[number];

/** The next colour in the identity palette, after the number of stored records. */
export function nextIdentityColor(count: number): IdentityColor {
  const index = ((count % identityColors.length) + identityColors.length) % identityColors.length;
  return identityColors[index] ?? "sky";
}
