import { Temporal } from "@num/shared";
import { useState } from "react";
import { formatMoney } from "@/money";

const width = 1000;
const height = 280;
const left = 78;
const right = 16;
const top = 16;
const bottom = 36;

export type ChartSeries = {
  name: string;
  amounts: number[];
  dashed?: boolean;
};

type ForecastChartProps = {
  currency: string;
  dates: string[];
  label?: string;
  known?: number[];
  estimated?: number[];
  lowest?: { date: string; amount: number };
  series?: ChartSeries[];
};

function shortDate(iso: string): string {
  if (iso.length === 7) {
    return Temporal.PlainDate.from(`${iso}-01`).toLocaleString(undefined, { month: "short", year: "2-digit" });
  }
  return Temporal.PlainDate.from(iso).toLocaleString(undefined, { month: "short", day: "numeric" });
}

function stepPath(points: { x: number; y: number }[]): string {
  const first = points[0];
  if (!first) {
    return "";
  }
  let path = `M${first.x} ${first.y}`;
  for (const point of points.slice(1)) {
    path += `H${point.x}V${point.y}`;
  }
  return path;
}

export function ForecastChart({ currency, dates, known = [], estimated = [], lowest, series, label }: ForecastChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const lines: ChartSeries[] = series ?? [
    { name: "Known", amounts: known },
    { name: "Estimated", amounts: estimated, dashed: true },
  ];
  const values = lines.flatMap((line) => line.amounts);
  const peak = Math.max(...values, 0);
  const floor = Math.min(...values, 0);
  const span = Math.max(peak - floor, 1);
  const yMax = peak + Math.round(span * 0.12);
  const yMin = floor < 0 ? floor - Math.round(span * 0.08) : 0;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xAt = (index: number) => left + (plotWidth * index) / Math.max(dates.length - 1, 1);
  const yAt = (value: number) => top + plotHeight * (1 - (value - yMin) / Math.max(yMax - yMin, 1));
  const linePoints = lines.map((line) => line.amounts.map((value, index) => ({ x: xAt(index), y: yAt(value) })));
  const linePaths = linePoints.map((points) => stepPath(points));
  const zero = yAt(0);
  const lowIndex = lowest ? Math.max(0, dates.indexOf(lowest.date)) : 0;
  const lowX = xAt(lowIndex);
  const lowY = lowest ? yAt(lines[1]?.amounts[lowIndex] ?? lines[0]?.amounts[lowIndex] ?? lowest.amount) : 0;
  const labelLeft = lowX > width * 0.72;
  const ticks = [yMin, Math.round((yMin + yMax) / 2), yMax];
  const dateIndexes = [0, Math.round((dates.length - 1) / 3), Math.round(((dates.length - 1) * 2) / 3), dates.length - 1];
  const hoverDate = hover === null ? null : dates[hover];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={
          label ??
          (lowest
            ? `Forecast. Lowest estimated point ${formatMoney(currency, lowest.amount)} on ${shortDate(lowest.date)}.`
            : "Chart")
        }
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={yAt(tick)} y2={yAt(tick)} className="stroke-border" strokeWidth="1" />
            <text x={left - 8} y={yAt(tick) + 4} textAnchor="end" className="fill-muted-foreground text-[12px]">
              {formatMoney(currency, tick)}
            </text>
          </g>
        ))}
        {dateIndexes.map((index) => (
          <text key={index} x={xAt(index)} y={height - 10} textAnchor="middle" className="fill-muted-foreground text-[12px]">
            {dates[index] ? shortDate(dates[index]) : ""}
          </text>
        ))}
        {linePaths[0] ? <path d={`${linePaths[0]}V${zero}H${xAt(0)}Z`} className="fill-primary" fillOpacity="0.07" /> : null}
        {lines.map((line, index) => (
          <path
            key={line.name}
            d={linePaths[index]}
            fill="none"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeDasharray={line.dashed ? "7 5" : undefined}
            className={line.dashed ? "stroke-est" : "stroke-primary"}
          />
        ))}
        {lowest ? (
          <>
            <circle cx={lowX} cy={lowY} r="7" className="fill-card stroke-attn" strokeWidth="3" />
            <text
              x={labelLeft ? lowX - 10 : lowX + 12}
              y={Math.min(lowY + 22, height - bottom)}
              textAnchor={labelLeft ? "end" : "start"}
              className="fill-attn text-[13px] font-semibold"
            >
              {`Lowest point: ${formatMoney(currency, lowest.amount)} on ${shortDate(lowest.date)}`}
            </text>
          </>
        ) : null}
        {hover !== null ? (
          <line x1={xAt(hover)} x2={xAt(hover)} y1={top} y2={height - bottom} className="stroke-muted-foreground" strokeWidth="1" />
        ) : null}
        <rect
          x={left}
          y={top}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = rect.width === 0 ? 0 : (event.clientX - rect.left) / rect.width;
            const index = Math.max(0, Math.min(dates.length - 1, Math.round(ratio * (dates.length - 1))));
            setHover(index);
          }}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hover !== null && hoverDate ? (
        <div
          className="pointer-events-none absolute top-2 rounded-[12px] border bg-card px-3 py-2 text-sm shadow-[var(--shadow)]"
          style={{ left: `${(xAt(hover) / width) * 100}%` }}
        >
          <p className="font-semibold">{shortDate(hoverDate)}</p>
          {lines.map((line) => (
            <p key={line.name}>
              {line.name} {formatMoney(currency, line.amounts[hover] ?? 0)}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
