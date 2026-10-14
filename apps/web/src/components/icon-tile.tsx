import type { ReactNode } from "react";
import { hueVars, type Hue } from "@/components/hue";

type IconTileProps = {
  hue: Hue;
  children: ReactNode;
  label?: string;
};

export function IconTile({ hue, children, label }: IconTileProps) {
  return (
    <span
      className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-(--hb) text-(--hf) [&_svg]:size-5"
      style={hueVars(hue)}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {children}
    </span>
  );
}
