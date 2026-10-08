import type { ReactNode } from "react";

export type SplitSegment = {
  key: string;
  label: string;
  color: string;
  value: number;
  amount: ReactNode;
};

type SplitBarProps = {
  label: string;
  segments: SplitSegment[];
};

export function SplitBar({ label, segments }: SplitBarProps) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  return (
    <div className="split-wrap">
      <div className="split" role="img" aria-label={label}>
        {total === 0 ? (
          <i style={{ flex: 1, background: "var(--sunken)" }} />
        ) : (
          segments.map((segment) => (
            <i key={segment.key} style={{ flex: Math.max(0, segment.value), background: segment.color }} />
          ))
        )}
      </div>
      <div className="key">
        {segments.map((segment) => (
          <span key={segment.key}>
            <i style={{ background: segment.color }} />
            {segment.label}
            <b>{segment.amount}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
