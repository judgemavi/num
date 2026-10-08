import type { ReactNode } from "react";

type PillProps = {
  tone?: "neutral" | "positive" | "attention";
  children: ReactNode;
};

export function Pill({ tone = "neutral", children }: PillProps) {
  const toneClass = tone === "positive" ? " pos" : tone === "attention" ? " attn" : "";
  return <span className={`pill${toneClass}`}>{children}</span>;
}
