import { memo, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { Label, Pie, PieChart, Sector, type PieSectorShapeProps } from "recharts";
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useBookCurrency } from "@/editors/lookups";
import { ChartTip } from "@/home/spending/chart-tip";
import type { Arc } from "@/home/spending/spend-arcs";
import { formatMoney } from "@/money";

/** The chart tokens of the slices. The arcs give the token and the opacity of each slice. */
const config = {
  "chart-1": { color: "var(--chart-1)" },
  "chart-2": { color: "var(--chart-2)" },
  "chart-3": { color: "var(--chart-3)" },
  "chart-4": { color: "var(--chart-4)" },
  "chart-5": { color: "var(--chart-5)" },
  est: { color: "var(--est)" },
} satisfies ChartConfig;

const rings = { group: { innerRadius: "43%", outerRadius: "67%" }, category: { innerRadius: "70%", outerRadius: "97%" } };

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

/** The slice under the pointer or with the focus, and the middle of the slice in the box of the donut. */
type Shown = { arc: Arc; x: number; y: number; size: number };

/** The lines of the tooltip and of the accessible name of a slice. */
function sliceLines(currency: string, arc: Arc, nameOf: SpendDonutProps["nameOf"]) {
  const { name, group } = nameOf(arc);
  const amount = formatMoney(currency, arc.row.amount);
  const ofTotal = `${percent(arc.end - arc.start)} of spending`;
  return arc.ofGroup === null ? [name, amount, ofTotal] : [name, group, amount, `${percent(arc.ofGroup)} of ${group}`, ofTotal];
}

/** The tooltip of a slice, in the chart tooltip style. */
function SliceTooltip({ shown, lines }: { shown: Shown; lines: string[] }) {
  const [title, ...rest] = lines;
  // The tooltip is outside the chart box, where the chart colour variables are not set. It uses the token itself.
  const color = `var(--${shown.arc.color.token})`;
  const left = Math.min(80, Math.max(20, (shown.x / shown.size) * 100));
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[115%] whitespace-nowrap" style={{ left: `${left}%`, top: `${(shown.y / shown.size) * 100}%` }}>
      <ChartTooltipContent
        active
        hideLabel
        payload={[{ name: shown.arc.key, value: shown.arc.end - shown.arc.start, graphicalItemId: shown.arc.ring, color }]}
        formatter={() => (
          <div className="grid gap-0.5">
            <ChartTip color={color} opacity={shown.arc.color.opacity} text={title ?? ""} />
            {rest.map((line) => (
              <p key={line} className="pl-[18px] tabular-nums">
                {line}
              </p>
            ))}
          </div>
        )}
      />
    </div>
  );
}

type RingsProps = Omit<SpendDonutProps, "centerLabel"> & { setShown: Dispatch<SetStateAction<Shown | null>> };

/**
 * The two rings. Recharts makes new slice elements each time a ring renders. Thus the rings do not render again when
 * the tooltip changes, and a slice that had the focus before a render gets it back.
 */
const Rings = memo(function Rings({ arcs, nameOf, isLit, isPressed, canSelect, onSelect, setShown }: RingsProps) {
  const currency = useBookCurrency();
  const focused = useRef<string | null>(null);
  const data = useMemo(() => {
    const ring = (name: Arc["ring"]) => arcs.filter((arc) => arc.ring === name).map((arc) => ({ key: arc.key, share: arc.end - arc.start, arc }));
    return { group: ring("group"), category: ring("category") };
  }, [arcs]);

  /** Recharts calls this function for each slice. */
  function slice(props: PieSectorShapeProps) {
    const arc: Arc = props.payload.arc;
    const active = canSelect(arc);
    // The middle of the slice. Recharts measures angles from 3 o'clock, counterclockwise.
    const angle = (-(props.startAngle + props.endAngle) / 2) * (Math.PI / 180);
    const radius = (props.innerRadius + props.outerRadius) / 2;
    const show = () => setShown({ arc, x: props.cx + radius * Math.cos(angle), y: props.cy + radius * Math.sin(angle), size: props.cx * 2 });
    const hide = () => setShown((current) => (current?.arc.key === arc.key ? null : current));
    const keepFocus = (element: SVGGElement | null) => {
      if (element && focused.current === arc.key && document.activeElement === document.body) {
        element.focus();
      }
    };
    const opacity = isLit(arc) ? arc.color.opacity : arc.color.opacity * 0.35;
    return (
      <g
        ref={active ? keepFocus : undefined}
        role={active ? "button" : "img"}
        tabIndex={active ? 0 : undefined}
        aria-label={sliceLines(currency, arc, nameOf).join(", ")}
        aria-pressed={active ? isPressed(arc) : undefined}
        className={active ? "cursor-pointer outline-none focus-visible:[&>path]:stroke-ring" : undefined}
        onClick={active ? () => onSelect(arc) : undefined}
        onKeyDown={(event) => {
          if (active && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            onSelect(arc);
          }
        }}
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocus={() => {
          focused.current = arc.key;
          show();
        }}
        onBlur={(event) => {
          // A slice that Recharts removes is not connected. Its focus comes back on the new slice.
          if (event.currentTarget.isConnected) {
            focused.current = null;
          }
          hide();
        }}
      >
        <Sector {...props} fill={`var(--color-${arc.color.token})`} fillOpacity={opacity} stroke="var(--card)" strokeWidth={2} />
      </g>
    );
  }

  return (["group", "category"] as const).map((name) => (
    <Pie key={name} data={data[name]} dataKey="share" nameKey="key" startAngle={90} endAngle={-270} {...rings[name]} rootTabIndex={-1} isAnimationActive={false} shape={slice} />
  ));
});

/** The two rings of spending: groups inside, their categories outside. A slice is a button when it can be selected. */
export function SpendDonut({ centerLabel, ...props }: SpendDonutProps) {
  const currency = useBookCurrency();
  const [shown, setShown] = useState<Shown | null>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setHost} className="relative mx-auto w-full max-w-[280px]">
      <ChartContainer config={config} role="group" aria-label={centerLabel} className="aspect-square w-full">
        <PieChart accessibilityLayer={false}>
          {/* The ring under the slices: grey when there is no spending. It also holds the label in the centre. */}
          <Pie
            data={[{ share: 1 }]}
            dataKey="share"
            innerRadius={rings.group.innerRadius}
            outerRadius={rings.category.outerRadius}
            fill={props.arcs.length === 0 ? "var(--sunken)" : "none"}
            stroke="none"
            isAnimationActive={false}
          >
            <Label value={centerLabel} position="center" fill="var(--muted-foreground)" fontSize={12} fontWeight={600} />
          </Pie>
          <Rings {...props} setShown={setShown} />
          {/* The tooltip needs the chart context, and it is HTML. Thus it goes from inside the chart to the box of the donut. */}
          {shown && host ? createPortal(<SliceTooltip shown={shown} lines={sliceLines(currency, shown.arc, props.nameOf)} />, host) : null}
        </PieChart>
      </ChartContainer>
    </div>
  );
}
