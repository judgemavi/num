import type { CSSProperties, ReactNode } from "react";
import { hueVars, type Hue } from "@/components/hue";

type IconTileProps = {
  hue: Hue;
  children: ReactNode;
  label?: string;
};

export function IconTile({ hue, children, label }: IconTileProps) {
  return (
    <span
      className="icon-tile"
      style={hueVars(hue) as CSSProperties}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {children}
    </span>
  );
}
