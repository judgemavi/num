import { usePlotArea, useXAxisScale, ZIndexLayer, DefaultZIndexes } from "recharts";
import { useBookCurrency } from "@/editors/lookups";
import { monthTitle } from "@/home/spending/format";
import { flowText, type BarKind, type MonthRow } from "@/home/spending/timeline-data";

type TargetsProps = { rows: MonthRow[]; kinds: BarKind[]; selected: string | null; onSelect: (month: string) => void };

/**
 * A button over each month that has actual data, in front of the bars. A click or Enter selects the
 * month; a second time clears it. The tooltip follows the pointer on the chart below the buttons.
 */
export function MonthTargets({ rows, kinds, selected, onSelect }: TargetsProps) {
  const currency = useBookCurrency();
  const scale = useXAxisScale("month");
  const plot = usePlotArea();
  if (!scale || !plot) {
    return null;
  }
  return (
    <ZIndexLayer zIndex={DefaultZIndexes.label + 1}>
      {rows.map((row) => {
        const start = scale(row.month, { position: "start" });
        const end = scale(row.month, { position: "end" });
        if (row.item.actual === null || start === undefined || end === undefined) {
          return null;
        }
        const text = kinds.map((kind) => flowText(currency, kind, row));
        return (
          <rect
            key={row.month}
            role="button"
            tabIndex={0}
            aria-pressed={row.month === selected}
            aria-label={`${monthTitle(row.month)}. ${text.join(". ")}.`}
            x={start}
            y={plot.y}
            width={end - start}
            height={plot.height}
            strokeWidth={3}
            className="cursor-pointer fill-transparent outline-none focus-visible:stroke-ring"
            onClick={() => onSelect(row.month)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(row.month);
              }
            }}
          />
        );
      })}
    </ZIndexLayer>
  );
}

function Key({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className={`block ${swatch}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export function TimelineLegend({ kinds, forecast }: { kinds: BarKind[]; forecast: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
      {kinds.map((kind) => (
        <Key key={kind.key} swatch={`size-2.5 rounded-sm ${kind.key === "income" ? "bg-teal-3" : "bg-ocean-1"}`} label={kind.label} />
      ))}
      {forecast ? <Key swatch="size-2.5 rounded-sm bg-ocean-1/35" label="Forecast" /> : null}
    </div>
  );
}
