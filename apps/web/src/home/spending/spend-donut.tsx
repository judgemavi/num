import { useState } from "react";
import { useBookCurrency } from "@/editors/lookups";
import { formatMoney } from "@/money";
import type { Arc } from "@/home/spending/spend-arcs";

const size = 240;
const center = size / 2;
const rings = { group: { inner: 52, outer: 80 }, category: { inner: 84, outer: 116 } };

function point(radius: number, turn: number) {
  const angle = turn * 2 * Math.PI - Math.PI / 2;
  return `${(center + radius * Math.cos(angle)).toFixed(2)} ${(center + radius * Math.sin(angle)).toFixed(2)}`;
}

function arcPath(ring: Arc["ring"], start: number, end: number) {
  const { inner, outer } = rings[ring];
  const large = end - start > 0.5 ? 1 : 0;
  return `M${point(outer, start)}A${outer} ${outer} 0 ${large} 1 ${point(outer, end)}L${point(inner, end)}A${inner} ${inner} 0 ${large} 0 ${point(inner, start)}Z`;
}

function percent(share: number) {
  return `${Math.round(share * 100)}%`;
}

type SpendDonutProps = {
  arcs: Arc[];
  /** The name of the row of an arc, and the name of its group. */
  nameOf: (arc: Arc) => { name: string; group: string };
  centerLabel: string;
  isLit: (arc: Arc) => boolean;
  isPressed: (arc: Arc) => boolean;
  canSelect: (arc: Arc) => boolean;
  onSelect: (arc: Arc) => void;
};

function Tooltip({ arc, lines }: { arc: Arc; lines: string[] }) {
  const { inner, outer } = rings[arc.ring];
  const angle = ((arc.start + arc.end) / 2) * 2 * Math.PI - Math.PI / 2;
  const radius = (inner + outer) / 2;
  const left = Math.min(80, Math.max(20, ((center + radius * Math.cos(angle)) / size) * 100));
  const top = ((center + radius * Math.sin(angle)) / size) * 100;
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[115%] rounded-[12px] border bg-card px-3 py-2 text-sm whitespace-nowrap shadow-[var(--shadow)]"
      style={{ left: `${left}%`, top: `${top}%` }}
    >
      {lines.map((line, position) => (
        <p key={position} className={position === 0 ? "font-semibold" : undefined}>
          {line}
        </p>
      ))}
    </div>
  );
}

export function SpendDonut({ arcs, nameOf, centerLabel, isLit, isPressed, canSelect, onSelect }: SpendDonutProps) {
  const currency = useBookCurrency();
  const [hover, setHover] = useState<string | null>(null);
  const lines = (arc: Arc) => {
    const { name, group } = nameOf(arc);
    const amount = formatMoney(currency, arc.row.amount);
    const ofTotal = `${percent(arc.end - arc.start)} of spending`;
    return arc.ofGroup === null ? [name, amount, ofTotal] : [name, group, amount, `${percent(arc.ofGroup)} of ${group}`, ofTotal];
  };
  const hovered = arcs.find((arc) => arc.key === hover);
  return (
    <div className="relative mx-auto w-full max-w-[280px]">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full" role="group" aria-label={centerLabel}>
        {arcs.length === 0 ? (
          <circle cx={center} cy={center} r={(rings.category.outer + rings.group.inner) / 2} className="fill-none stroke-sunken" strokeWidth={rings.category.outer - rings.group.inner} />
        ) : null}
        {arcs.map((arc) => {
          const active = canSelect(arc);
          const { inner, outer } = rings[arc.ring];
          return (
            <g
              key={arc.key}
              role={active ? "button" : "img"}
              tabIndex={active ? 0 : undefined}
              aria-label={lines(arc).join(", ")}
              aria-pressed={active ? isPressed(arc) : undefined}
              opacity={isLit(arc) ? arc.color.opacity : arc.color.opacity * 0.35}
              className={`stroke-card ${active ? "cursor-pointer outline-none focus-visible:opacity-100 focus-visible:[&>*]:stroke-ring" : ""}`}
              strokeWidth="2"
              onClick={active ? () => onSelect(arc) : undefined}
              onKeyDown={(event) => {
                if (active && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onSelect(arc);
                }
              }}
              onPointerEnter={() => setHover(arc.key)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(arc.key)}
              onBlur={() => setHover(null)}
            >
              {arc.end - arc.start >= 0.9999 ? (
                <circle cx={center} cy={center} r={(outer + inner) / 2} fill="none" strokeWidth={outer - inner} className={arc.color.stroke} />
              ) : (
                <path d={arcPath(arc.ring, arc.start, arc.end)} className={arc.color.fill} />
              )}
            </g>
          );
        })}
        <text x={center} y={center + 5} textAnchor="middle" className="fill-muted-foreground text-[12px] font-semibold">
          {centerLabel}
        </text>
      </svg>
      {hovered ? <Tooltip arc={hovered} lines={lines(hovered)} /> : null}
    </div>
  );
}
