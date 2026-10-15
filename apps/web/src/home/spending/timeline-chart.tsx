import { Bar, CartesianGrid, ComposedChart, Rectangle, ReferenceArea, ReferenceLine, XAxis, YAxis, type BarShapeProps } from "recharts";
import { localAsOf } from "@/as-of";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useBookCurrency, useCategoryNames } from "@/editors/lookups";
import { ChartTip } from "@/home/spending/chart-tip";
import { monthTitle } from "@/home/spending/format";
import { dayPosition, flowText, monthRows, shortMonth, timelineRanges, type BarKind, type MonthRow } from "@/home/spending/timeline-data";
import { MonthTargets, TimelineLegend } from "@/home/spending/timeline-parts";
import { useSpendingReport } from "@/home/spending/use-spending";
import { formatMoney } from "@/money";

/** The series of the timeline and their chart tokens (design §6 Charts). */
const config = {
  income: { label: "Income", color: "var(--chart-3)" },
  spending: { label: "Spending", color: "var(--chart-2)" },
} satisfies ChartConfig;

const forecastOpacity = 0.35;
/** Tick labels at 12px in the muted colour. Recharts draws them at their real size. */
const tick = { fontSize: 12, fill: "var(--muted-foreground)" };

/** A bar of the forecast part. A month where the forecast ends before the month ends has a dashed outline on it. */
function forecastShape(color: string) {
  return function forecastBar(props: BarShapeProps) {
    const row: MonthRow = props.payload;
    const partial = row.end !== null;
    return <Rectangle {...props} stroke={partial ? color : undefined} strokeWidth={partial ? 1.5 : undefined} strokeDasharray={partial ? "4 3" : undefined} />;
  };
}

/**
 * The timeline of the report: income and spending for each month, or only spending with a category or a tag. It shows the
 * Today marker only when the period ends today.
 */
export function TimelineChart() {
  const currency = useBookCurrency();
  const { data, search, patchSearch } = useSpendingReport();
  const categoryName = useCategoryNames().get(search.category ?? "");
  const timeline = data.timeline;
  const rows = monthRows(timeline);
  const ranges = timelineRanges(timeline);
  // With a category or a tag, the timeline has only spending bars.
  const kinds: BarKind[] =
    timeline.categoryId || data.tagId
      ? [{ key: "spending", label: categoryName ?? "Spending" }]
      : [
          { key: "income", label: "Income" },
          { key: "spending", label: "Spending" },
        ];
  const asOf = localAsOf();
  const todayX = data.to === asOf ? dayPosition(timeline.months, asOf) : null;
  const money = (value: number) => formatMoney(currency, value);
  const selectedMonth = search.month ?? null;
  return (
    <>
      <ChartContainer
        config={config}
        role="group"
        aria-label={`Timeline by month. Highest monthly spending ${money(ranges.peakSpending)}. Select a month to see its spending.`}
        className="aspect-auto min-h-[260px] w-full flex-1"
      >
        <ComposedChart data={rows} margin={{ top: 24, right: 4, bottom: 0, left: 4 }} accessibilityLayer={false}>
          <CartesianGrid vertical={false} yAxisId="flow" />
          <XAxis xAxisId="month" dataKey="month" tickFormatter={shortMonth} tick={tick} tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
          <XAxis xAxisId="day" type="number" dataKey="x" domain={[0, rows.length]} allowDataOverflow hide height={0} />
          <YAxis yAxisId="flow" domain={[0, ranges.barTicks.at(-1) ?? 0]} ticks={ranges.barTicks} tickFormatter={money} tick={tick} width="auto" tickLine={false} axisLine={false} />
          {selectedMonth ? <ReferenceArea xAxisId="month" yAxisId="flow" x1={selectedMonth} x2={selectedMonth} fill="var(--primary-soft)" fillOpacity={1} /> : null}
          <ChartTooltip
            axisId="month"
            content={
              <ChartTooltipContent
                labelClassName="font-semibold"
                labelFormatter={(month) => monthTitle(String(month))}
                formatter={(_value, _name, entry) => {
                  const kind = kinds.find((item) => `${item.key}Actual` === entry.dataKey);
                  const row: MonthRow = entry.payload;
                  return kind ? <ChartTip color={entry.color} text={flowText(currency, kind, row)} /> : null;
                }}
              />
            }
          />
          {kinds.flatMap((kind) => [
            <Bar key={`${kind.key}-actual`} xAxisId="month" yAxisId="flow" dataKey={`${kind.key}Actual`} stackId={kind.key} fill={`var(--color-${kind.key})`} maxBarSize={40} />,
            <Bar
              key={`${kind.key}-forecast`}
              xAxisId="month"
              yAxisId="flow"
              dataKey={`${kind.key}Forecast`}
              stackId={kind.key}
              fill={`var(--color-${kind.key})`}
              fillOpacity={forecastOpacity}
              radius={[2, 2, 0, 0]}
              maxBarSize={40}
              tooltipType="none"
              shape={forecastShape(`var(--color-${kind.key})`)}
            />,
          ])}
          {todayX !== null ? (
            <ReferenceLine
              xAxisId="day"
              yAxisId="flow"
              x={todayX}
              stroke="var(--muted-foreground)"
              strokeDasharray="3 4"
              label={{ value: "Today", position: "top", fill: "var(--muted-foreground)", fontSize: 12, fontWeight: 600 }}
            />
          ) : null}
          <MonthTargets rows={rows} kinds={kinds} selected={selectedMonth} onSelect={(month) => patchSearch({ month: search.month === month ? undefined : month })} />
        </ComposedChart>
      </ChartContainer>
      <TimelineLegend kinds={kinds} forecast={timeline.forecastEnd !== null} />
    </>
  );
}
