import { Temporal, type InsightFlow, type InsightTimeline, type InsightTimelineMonth } from "@num/shared";
import { useState } from "react";
import { localAsOf } from "@/as-of";
import { useBookCurrency, useCategoryNames } from "@/editors/lookups";
import { monthTitle } from "@/insights/format";
import { chart, flowTotal, forecastPoints, shortDay, shortMonth, timelineScale } from "@/insights/timeline-scale";
import { useInsightsReport } from "@/insights/use-report";
import { formatMoney } from "@/money";

type Scale = ReturnType<typeof timelineScale>;

const barKinds: { key: keyof InsightFlow; label: string; fill: string; stroke: string }[] = [
  { key: "income", label: "Income", fill: "fill-chart-3", stroke: "stroke-chart-3" },
  { key: "spending", label: "Spending", fill: "fill-chart-2", stroke: "stroke-chart-2" },
];

function positive(value: number | undefined) {
  return value !== undefined && value > 0 ? value : 0;
}

type BarsProps = { item: InsightTimelineMonth; position: number; scale: Scale; kinds: typeof barKinds; partial: boolean };

/** A partial month (the forecast ends before the month ends) has a dashed outline on its forecast part. */
function MonthBars({ item, position, scale, kinds, partial }: BarsProps) {
  const width = scale.band * (kinds.length === 1 ? 0.44 : 0.3);
  return (
    <>
      {kinds.map((kind, slot) => {
        const x = scale.bandX(position) + scale.band * (kinds.length === 1 ? 0.28 : 0.16 + slot * 0.38);
        const actual = positive(item.actual?.[kind.key]);
        const planned = positive(item.forecast?.[kind.key]);
        return (
          <g key={kind.key} className={kind.fill}>
            {actual > 0 ? <rect x={x} y={scale.barY(actual)} width={width} height={scale.bottom - scale.barY(actual)} rx="2" /> : null}
            {planned > 0 ? (
              <rect
                x={x}
                y={scale.barY(actual + planned)}
                width={width}
                height={scale.barY(actual) - scale.barY(actual + planned)}
                rx="2"
                fillOpacity="0.35"
                className={partial ? kind.stroke : undefined}
                strokeWidth={partial ? 1.5 : undefined}
                strokeDasharray={partial ? "4 3" : undefined}
              />
            ) : null}
          </g>
        );
      })}
    </>
  );
}

function flowText(currency: string, label: string, actual: number | undefined, planned: number | undefined, end: string | null) {
  const parts: string[] = [];
  if (actual !== undefined) {
    parts.push(formatMoney(currency, actual));
  }
  if (planned !== undefined) {
    parts.push(`${formatMoney(currency, planned)} forecast${end ? ` to ${shortDay(end)}` : ""}`);
  }
  return `${label} ${parts.join(" + ")}`;
}

/** `end` is the last forecast day when the forecast stops inside this month. */
function monthText(currency: string, item: InsightTimelineMonth, kinds: typeof barKinds, end: string | null) {
  return kinds.map((kind) => flowText(currency, kind.label, item.actual?.[kind.key], item.forecast?.[kind.key], end));
}

function partialEnd(timeline: InsightTimeline) {
  const last = timeline.forecast?.dates.at(-1);
  if (!last) {
    return null;
  }
  const day = Temporal.PlainDate.from(last);
  return day.day < day.daysInMonth ? last : null;
}

function Axes({ scale, months }: { scale: Scale; months: InsightTimelineMonth[] }) {
  const currency = useBookCurrency();
  const step = Math.ceil(months.length / 12);
  return (
    <>
      {scale.barTicks.map((tick) => (
        <g key={`bar-${tick}`}>
          <line x1={chart.left} x2={chart.width - chart.right} y1={scale.barY(tick)} y2={scale.barY(tick)} className="stroke-border" />
          <text x={chart.left - 8} y={scale.barY(tick) + 4} textAnchor="end" className="fill-muted-foreground text-[12px]">
            {formatMoney(currency, tick)}
          </text>
        </g>
      ))}
      {scale.hasBalance
        ? scale.balanceTicks.map((tick) => (
            <text key={`balance-${tick}`} x={chart.width - chart.right + 8} y={scale.balanceY(tick) + 4} className="fill-chart-5 text-[12px]">
              {formatMoney(currency, tick)}
            </text>
          ))
        : null}
      {months.map((item, position) =>
        position % step === 0 ? (
          <text key={item.month} x={scale.bandX(position) + scale.band / 2} y={chart.height - 14} textAnchor="middle" className="fill-muted-foreground text-[12px]">
            {shortMonth(item.month)}
          </text>
        ) : null,
      )}
    </>
  );
}

function BalanceLines({ scale, timeline }: { scale: Scale; timeline: InsightTimeline }) {
  const forecast = timeline.forecast;
  return (
    <g fill="none" strokeLinejoin="round" strokeWidth="2.5">
      <path d={scale.linePath(timeline.balances)} className="stroke-chart-5" />
      {forecast ? (
        <>
          <path d={scale.linePath(forecastPoints(forecast.dates, forecast.known))} className="stroke-est" strokeDasharray="7 5" strokeWidth="2" />
          <path d={scale.linePath(forecastPoints(forecast.dates, forecast.estimated))} className="stroke-chart-5" strokeOpacity="0.45" />
        </>
      ) : null}
    </g>
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

function Legend({ kinds, balance }: { kinds: typeof barKinds; balance: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
      {kinds.map((kind) => (
        <Key key={kind.key} swatch={`size-2.5 rounded-sm ${kind.key === "income" ? "bg-chart-3" : "bg-chart-2"}`} label={kind.label} />
      ))}
      {balance ? (
        <>
          <Key swatch="size-2.5 rounded-sm bg-chart-2/35" label="Forecast (lighter)" />
          <Key swatch="h-0.5 w-4 bg-chart-5" label="Balance" />
          <Key swatch="h-0.5 w-4 bg-chart-5/45" label="Balance forecast" />
          <Key swatch="h-0.5 w-4 border-t-2 border-dashed border-est" label="Known payments only" />
        </>
      ) : null}
    </div>
  );
}

/** The timeline of the report: income, spending and the balance for each month. It shows the Today marker only when the period ends today. */
export function TimelineChart() {
  const currency = useBookCurrency();
  const { data, search, patchSearch } = useInsightsReport();
  const categoryName = useCategoryNames().get(search.category ?? "");
  const [hover, setHover] = useState<number | null>(null);
  const asOf = localAsOf();
  const timeline = data.timeline;
  const selectedMonth = search.month ?? null;
  const onSelectMonth = (month: string) => patchSearch({ month: search.month === month ? undefined : month });
  const scale = timelineScale(timeline);
  const kinds = timeline.categoryId
    ? [{ key: "spending" as const, label: categoryName ?? "Spending", fill: "fill-chart-2", stroke: "stroke-chart-2" }]
    : barKinds;
  const todayX = data.to === asOf ? scale.dateX(asOf) : null;
  const end = partialEnd(timeline);
  const endOf = (month: string) => (end !== null && end.startsWith(month) ? end : null);
  const hovered = hover === null ? null : timeline.months[hover];
  const peak = Math.max(0, ...timeline.months.map((item) => flowTotal(item, "spending")));
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        className="h-auto w-full"
        role="group"
        aria-label={`Timeline by month. Highest monthly spending ${formatMoney(currency, peak)}. Select a month to see its spending.`}
      >
        <Axes scale={scale} months={timeline.months} />
        {timeline.months.map((item, position) => {
          const selectable = item.actual !== null;
          const selected = item.month === selectedMonth;
          return (
            <g
              key={item.month}
              role={selectable ? "button" : undefined}
              tabIndex={selectable ? 0 : undefined}
              aria-pressed={selectable ? selected : undefined}
              aria-label={`${monthTitle(item.month)}. ${monthText(currency, item, kinds, endOf(item.month)).join(". ")}.`}
              className={selectable ? "cursor-pointer outline-none focus-visible:[&>rect:first-child]:stroke-ring" : undefined}
              onClick={selectable ? () => onSelectMonth(item.month) : undefined}
              onKeyDown={(event) => {
                if (selectable && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onSelectMonth(item.month);
                }
              }}
              onPointerEnter={() => setHover(position)}
              onPointerLeave={() => setHover(null)}
            >
              <rect
                x={scale.bandX(position)}
                y={chart.top}
                width={scale.band}
                height={scale.bottom - chart.top}
                className={selected ? "fill-primary-soft" : "fill-transparent"}
                strokeWidth="3"
              />
              <MonthBars item={item} position={position} scale={scale} kinds={kinds} partial={endOf(item.month) !== null} />
            </g>
          );
        })}
        <g className="pointer-events-none">
          <BalanceLines scale={scale} timeline={timeline} />
          {todayX !== null ? (
            <>
              <line x1={todayX} x2={todayX} y1={chart.top - 6} y2={scale.bottom} className="stroke-muted-foreground" strokeDasharray="3 4" />
              <text x={todayX} y={chart.top - 12} textAnchor="middle" className="fill-muted-foreground text-[12px] font-semibold">
                Today
              </text>
            </>
          ) : null}
        </g>
      </svg>
      <Legend kinds={kinds} balance={timeline.forecast !== null} />
      {hovered && hover !== null ? (
        <div
          className="pointer-events-none absolute top-8 z-10 -translate-x-1/2 rounded-[12px] border bg-card px-3 py-2 text-sm whitespace-nowrap shadow-[var(--shadow)]"
          style={{ left: `${((scale.bandX(hover) + scale.band / 2) / chart.width) * 100}%` }}
        >
          <p className="font-semibold">{monthTitle(hovered.month)}</p>
          {monthText(currency, hovered, kinds, endOf(hovered.month)).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
