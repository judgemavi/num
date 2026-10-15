import type { ReactNode } from "react";
import { hueVars, type Hue } from "@/components/hue";
import { ItemMedia } from "@/components/ui/item";

/**
 * The icon of a row: the media of a shadcn `Item` with an identity hue, a soft fill and a deep glyph
 * (`docs/design.md` §6). "attention" is the tomato tile of an item that needs the user (§8). The tile is decoration.
 */
export function IconTile({ hue, children }: { hue: Hue | "attention"; children: ReactNode }) {
  return (
    <ItemMedia
      variant="icon"
      aria-hidden="true"
      className="size-10 rounded-[10px] bg-(--hb) text-(--hf) [&_svg:not([class*='size-'])]:size-5"
      style={hue === "attention" ? { "--hb": "var(--attn-soft)", "--hf": "var(--attn)" } : hueVars(hue)}
    >
      {children}
    </ItemMedia>
  );
}
