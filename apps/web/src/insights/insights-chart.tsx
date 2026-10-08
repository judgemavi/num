import { Temporal } from "@num/shared";
import { useState } from "react";
import { formatMoney } from "@/money";

const width = 1000;
const height = 280;
const left = 78;
const right = 16;
const top = 16;
const bottom = 36;

type ChartSeries = {
  name: string;
  amounts: number[];
  dashed?: boolean;
};

type InsightsChartProps = {
  currency: string;
  label: string;
  months: string[];
  series: ChartSeries[];
};

function monthLabel(month: string): string {
  return Temporal.PlainDate.from(`${month}-01`).toLocaleString(undefined, { month: "short", year: "2-digit" });
}

function linePath(points: { x: number; y: number }[]): string {
  const first = points[0];
  if (!first) {
    return "";
  }
  let path = `M${first.x} ${first.y}`;
  for (const point of points.slice(1)) {
    path += `L${point.x} ${point.y}`;
  }
  return path;
}

export function InsightsChart({ currency, label, months, series }: InsightsChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const values = series.flatMap((item) => item.amounts);
  const peak = Math.max(...values, 0);
  const floor = Math.min(...values, 0);
  const span = Math.max(peak - floor, 1);
  const yMax = peak + Math.round(span * 0.12);
  const yMin = floor < 0 ? floor - Math.round(span * 0.08) : 0;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xAt = (index: number) => left + (plotWidth * index) / Math.max(months.length - 1, 1);
  const yAt = (value: number) => top + plotHeight * (1 - (value - yMin) / Math.max(yMax - yMin, 1));
  const ticks = [yMin, Math.round((yMin + yMax) / 2), yMax];
  const dateIndexes = [0, Math.round((months.length - 1) / 3), Math.round(((months.length - 1) * 2) / 3), months.length - 1];
  const zero = yAt(0);
  const first = series[0];
  const firstPoints = (first?.amounts ?? []).map((value, index) => ({ x: xAt(index), y: yAt(value) }));
  const firstPath = linePath(firstPoints);
  const hoverMonth = hover === null ? null : months[hover];

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {series.map((item) => (
          <span key={item.name} className="inline-flex items-center gap-2">
            <svg width="28" height="10" aria-hidden="true">
              <line
                x1="0"
                y1="5"
                x2="28"
                y2="5"
                strokeWidth="2.5"
                strokeDasharray={item.dashed ? "6 4" : undefined}
                className={item.dashed ? "stroke-est" : "stroke-primary"}
              />
            </svg>
            {item.name}
          </span>
        ))}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={label}>
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
              {months[index] ? monthLabel(months[index]) : ""}
            </text>
          ))}
          <path d={`${firstPath}V${zero}H${xAt(0)}Z`} className="fill-primary" fillOpacity="0.07" />
          {series.map((item) => {
            const path = linePath(item.amounts.map((value, index) => ({ x: xAt(index), y: yAt(value) })));
            return (
              <path
                key={item.name}
                d={path}
                fill="none"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeDasharray={item.dashed ? "7 5" : undefined}
                className={item.dashed ? "stroke-est" : "stroke-primary"}
              />
            );
          })}
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
              const index = Math.max(0, Math.min(months.length - 1, Math.round(ratio * (months.length - 1))));
              setHover(index);
            }}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {hover !== null && hoverMonth ? (
          <div
            className="pointer-events-none absolute top-2 rounded-[12px] border bg-card px-3 py-2 text-sm shadow-[var(--shadow)]"
            style={{ left: `${(xAt(hover) / width) * 100}%` }}
          >
            <p className="font-semibold">{monthLabel(hoverMonth)}</p>
            {series.map((item) => (
              <p key={item.name}>
                {item.name} {formatMoney(currency, item.amounts[hover] ?? 0)}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
