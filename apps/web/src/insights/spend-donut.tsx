import type { InsightRow } from "@num/shared";
import { useBookCurrency } from "@/editors/lookups";
import { formatMoney } from "@/money";
import { neutralTone, rowKey, type SliceColor } from "@/insights/slice-colors";

const size = 220;
const outer = 104;
const inner = 66;
const center = size / 2;

function point(radius: number, turn: number) {
  const angle = turn * 2 * Math.PI - Math.PI / 2;
  return `${(center + radius * Math.cos(angle)).toFixed(2)} ${(center + radius * Math.sin(angle)).toFixed(2)}`;
}

function arc(start: number, end: number) {
  const large = end - start > 0.5 ? 1 : 0;
  return `M${point(outer, start)}A${outer} ${outer} 0 ${large} 1 ${point(outer, end)}L${point(inner, end)}A${inner} ${inner} 0 ${large} 0 ${point(inner, start)}Z`;
}

type SpendDonutProps = {
  rows: InsightRow[];
  colors: Map<string, SliceColor>;
  label: (row: InsightRow) => string;
  centerLabel: string;
  selectedKey: string | null;
  canSelect: (row: InsightRow) => boolean;
  onSelect: (row: InsightRow) => void;
};

export function SpendDonut({ rows, colors, label, centerLabel, selectedKey, canSelect, onSelect }: SpendDonutProps) {
  const currency = useBookCurrency();
  const slices = rows.filter((row) => row.amount > 0);
  const total = slices.reduce((sum, row) => sum + row.amount, 0);
  const starts = slices.map((_, position) => slices.slice(0, position).reduce((sum, row) => sum + row.amount, 0) / total);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-auto w-full max-w-[260px]" role="group" aria-label={centerLabel}>
      {slices.length === 0 ? <circle cx={center} cy={center} r={(outer + inner) / 2} className="fill-none stroke-sunken" strokeWidth={outer - inner} /> : null}
      {slices.map((row, position) => {
        const share = row.amount / total;
        const start = starts[position] ?? 0;
        const end = start + share;
        const key = rowKey(row);
        const color = colors.get(key) ?? { ...neutralTone, opacity: 1 };
        const active = canSelect(row);
        const dimmed = selectedKey !== null && selectedKey !== key;
        const text = `${label(row)}: ${formatMoney(currency, row.amount)}, ${Math.round(share * 100)}%`;
        const shape =
          share >= 0.9999 ? (
            <circle cx={center} cy={center} r={(outer + inner) / 2} fill="none" strokeWidth={outer - inner} className={color.stroke} />
          ) : (
            <path d={arc(start, end)} className={color.fill} />
          );
        return (
          <g
            key={key}
            role={active ? "button" : "img"}
            tabIndex={active ? 0 : undefined}
            aria-label={text}
            aria-pressed={active ? selectedKey === key : undefined}
            opacity={dimmed ? color.opacity * 0.35 : color.opacity}
            className={`stroke-card ${active ? "cursor-pointer outline-none focus-visible:opacity-100 focus-visible:[&>*]:stroke-ring" : ""}`}
            strokeWidth="2"
            onClick={active ? () => onSelect(row) : undefined}
            onKeyDown={(event) => {
              if (active && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onSelect(row);
              }
            }}
          >
            <title>{text}</title>
            {shape}
          </g>
        );
      })}
      <text x={center} y={center + 5} textAnchor="middle" className="fill-muted-foreground text-[13px] font-semibold">
        {centerLabel}
      </text>
    </svg>
  );
}
