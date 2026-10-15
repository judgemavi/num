import { Temporal, type MonthPlan } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { monthPlanQuery } from "@/api/plan";
import { localAsOf } from "@/as-of";
import { Amount } from "@/components/amount";
import { PaycheckSplitIllustration } from "@/components/illustrations";
import { hueColor } from "@/components/hue";
import { ListCard, ListRow, listAmt, listName } from "@/components/list-card";
import { SplitBar } from "@/components/split-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEditors } from "@/editors/editor-api";
import { useBookCurrency } from "@/editors/lookups";
import { formatMoney } from "@/money";

const commitmentColor = hueColor.sky.glyph;
const bucketColor = hueColor.lilac.glyph;
const saveColor = "#2B7A4E";

function longDate(iso: string) {
  return Temporal.PlainDate.from(iso).toLocaleString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function countLabel(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function FlowStep({
  label,
  planned,
  actual,
  compare,
  tone,
}: {
  label: string;
  planned: number;
  actual: number;
  compare: boolean;
  tone?: string;
}) {
  const currency = useBookCurrency();
  return (
    <div>
      <span className="block text-[13px] font-semibold text-muted-foreground">{label}</span>
      <b className={`font-display text-[34px] leading-none font-extrabold tabular-nums [font-stretch:72%] ${tone ?? ""}`}>
        {formatMoney(currency, planned)}
      </b>
      {compare ? <span className="mt-1 block text-[13px] text-muted-foreground">Actual {formatMoney(currency, actual)}</span> : null}
    </div>
  );
}

export function MonthFlow({ plan }: { plan: MonthPlan }) {
  const currency = useBookCurrency();
  const left = plan.leftToSave.planned;
  const commitments = plan.commitments.items.length;
  const buckets = plan.funding.items.length;
  return (
    <Card aria-label="Monthly flow" className="border-transparent bg-tint-plan">
      <CardContent className="grid items-center gap-6 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <FlowStep label="Income" planned={plan.income.planned} actual={plan.income.actual} compare={plan.compareActual} />
            <ArrowRight className="text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
            <FlowStep label="Commitments" planned={plan.commitments.planned} actual={plan.commitments.actual} compare={plan.compareActual} />
            <ArrowRight className="text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
            <FlowStep label="Bucket funding" planned={plan.funding.planned} actual={plan.funding.actual} compare={plan.compareActual} />
            <ArrowRight className="text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
            <FlowStep
              label="Left to save"
             
              planned={left}
              actual={plan.leftToSave.actual}
              compare={plan.compareActual}
              tone={left < 0 ? "text-attn" : "text-pos"}
            />
          </div>
          <div className="mt-4">
            <SplitBar
              label={`Of income: commitments ${formatMoney(currency, plan.commitments.planned)}, bucket funding ${formatMoney(currency, plan.funding.planned)}, left to save ${formatMoney(currency, left)}`}
              segments={[
                { key: "commitments", label: countLabel(commitments, "commitment", "commitments"), color: commitmentColor, value: plan.commitments.planned, amount: <Amount value={plan.commitments.planned} /> },
                { key: "buckets", label: countLabel(buckets, "bucket", "buckets"), color: bucketColor, value: plan.funding.planned, amount: <Amount value={plan.funding.planned} /> },
                { key: "save", label: "Left to save", color: saveColor, value: Math.max(0, left), amount: <Amount value={left} /> },
              ]}
            />
          </div>
        </div>
        <PaycheckSplitIllustration />
      </CardContent>
    </Card>
  );
}

/** The check that the goals and the sinking funds fit in the income of the month. It reads the plan of this month. */
export function GoalFeasibility() {
  const { openEditor } = useEditors();
  const item = useSuspenseQuery(monthPlanQuery(localAsOf())).data.feasibility;
  if (!item || (item.shortfall === 0 && item.buckets.length === 0)) {
    return null;
  }
  return (
    <Card>
      <CardHeader className="px-5 pt-5">
        <CardTitle className="text-base font-bold">Goal feasibility</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 px-0 pb-5">
        <p className="px-5">
          Income is <Amount value={item.income} /> a month. Commitments take <Amount value={item.commitments} />. Spending refills take <Amount value={item.refills} />.{item.emergency > 0 ? <> The emergency fund takes <Amount value={item.emergency} />.</> : null} <Amount value={item.surplus} /> is left for goals and sinking funds.
        </p>
        {item.shortfall > 0 ? (
          <p className="px-5 font-semibold text-attn">
            Goals and sinking funds need <Amount value={item.need} className="text-attn" /> a month. That is <Amount value={item.shortfall} className="text-attn" /> short. Cut <Amount value={item.shortfall} className="text-attn" /> from other buckets each month.
          </p>
        ) : (
          <p className="px-5">These amounts fit in your monthly income.</p>
        )}
        {item.buckets.map((bucket) => (
          <ListRow key={bucket.bucketId} simple onOpen={() => void openEditor("bucket", { id: bucket.bucketId })}>
            <span className={listName}>
              {bucket.name}
              {bucket.laterDate ? <small>A date of {longDate(bucket.laterDate)} fits.</small> : null}
            </span>
            <span className={listAmt}>
              <Amount value={bucket.monthly} />
              <small>a month</small>
            </span>
          </ListRow>
        ))}
      </CardContent>
    </Card>
  );
}

export function MonthDetails({ plan }: { plan: MonthPlan }) {
  const currency = useBookCurrency();
  const { openEditor } = useEditors();
  return (
    <>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <ListCard label="Commitments" title="Commitments" actions={<span className="text-sm font-semibold tabular-nums">{formatMoney(currency, plan.commitments.planned)}</span>}>
          {plan.commitments.items.length === 0 ? <p className="px-5 py-5 text-muted-foreground">No commitments yet.</p> : null}
          {plan.commitments.items.map((item) => (
            <ListRow key={item.bucketId} onOpen={() => void openEditor("commitment", { id: item.bucketId })}>
              <span className={listName}>{item.name}</span>
              <span className={listAmt}>
                <Amount value={item.planned} />
                {plan.compareActual ? <small>Actual {formatMoney(currency, item.actual)}</small> : null}
              </span>
            </ListRow>
          ))}
        </ListCard>
        <ListCard
          label="Bucket funding"
          title="Bucket funding"
          actions={<span className="text-sm font-semibold tabular-nums">{formatMoney(currency, plan.funding.planned)}</span>}
        >
          {plan.funding.items.length === 0 ? <p className="px-5 py-5 text-muted-foreground">No bucket funding this month.</p> : null}
          {plan.funding.items.map((item) => (
            <ListRow key={item.bucketId} onOpen={() => void openEditor("bucket", { id: item.bucketId })}>
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: hueColor[item.color].glyph }} aria-hidden="true" />
              <span className={listName}>
                {item.name}
              </span>
              <span className={listAmt}>
                <Amount value={item.planned} />
                {plan.compareActual ? <small>Actual {formatMoney(currency, item.actual)}</small> : null}
              </span>
            </ListRow>
          ))}
        </ListCard>
      </div>
    </>
  );
}
