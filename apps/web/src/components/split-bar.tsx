type SplitSegment = {
  key: string;
  color: string;
  value: number;
};

/** A bar in segments. It has no key: the facts next to it name the segments with a dot in the same colour. */
export function SplitBar({ label, segments }: { label: string; segments: SplitSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  return (
    <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={label}>
      {total === 0 ? (
        <i className="block h-full flex-1 bg-sunken" />
      ) : (
        segments.map((segment) => (
          <i key={segment.key} className="block h-full" style={{ flex: Math.max(0, segment.value), background: segment.color }} />
        ))
      )}
    </div>
  );
}
