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
    <div>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={label}>
        {total === 0 ? (
          <i className="block h-full flex-1 bg-sunken" />
        ) : (
          segments.map((segment) => (
            <i key={segment.key} className="block h-full" style={{ flex: Math.max(0, segment.value), background: segment.color }} />
          ))
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-5 text-sm text-muted-foreground">
        {segments.map((segment) => (
          <span key={segment.key} className="inline-flex items-center gap-1.5">
            <i className="size-2 rounded-full" style={{ background: segment.color }} />
            {segment.label}
            <b className="font-semibold text-foreground">{segment.amount}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
