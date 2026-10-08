import type { CSSProperties } from "react";

type ProgressProps = {
  value: number;
  label: string;
  over?: boolean;
  color?: string;
};

export function Progress({ value, label, over = false, color }: ProgressProps) {
  const width = Math.max(0, Math.min(1, value)) * 100;
  const style = color ? ({ "--hf": color } as CSSProperties) : undefined;
  return (
    <div className={over ? "bar over" : "bar"} role="img" aria-label={label} style={style}>
      {over ? null : <i style={{ width: `${width}%` }} />}
    </div>
  );
}
