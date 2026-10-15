/** One line of a chart tooltip: the colour of the series or the slice, and its text. Both Home charts use it. */
export function ChartTip({ color, opacity = 1, text }: { color: string | undefined; opacity?: number; text: string }) {
  return (
    <div className="flex w-full items-center gap-2">
      <i aria-hidden="true" className="block size-2.5 shrink-0 rounded-[2px]" style={{ background: color, opacity }} />
      <span className="tabular-nums">{text}</span>
    </div>
  );
}
