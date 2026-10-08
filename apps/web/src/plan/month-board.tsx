import { Temporal, type MonthPlan } from "@num/shared";
import { ArrowRight } from "lucide-react";
import { Amount } from "@/components/amount";
import { PaycheckSplitIllustration } from "@/components/illustrations";
import { hueColor } from "@/components/hue";
import { ListCard, ListRow, listAmt, listName } from "@/components/list-card";
import { SplitBar } from "@/components/split-bar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEditors } from "@/editors/editor-api";
import { formatMoney } from "@/money";

const billColor = hueColor.sky.glyph;
const bucketColor = hueColor.lilac.glyph;
const saveColor = "#2B7A4E";

function shortDate(iso: string): string {
  return Temporal.PlainDate.from(iso).toLocaleString(undefined, { month: "short", day: "numeric" });
}

function longDate(iso: string): string {
  return Temporal.PlainDate.from(iso).toLocaleString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function FlowStep({
  label,
  currency,
  planned,
  actual,
  compare,
  tone,
}: {
  label: string;
  currency: string;
  planned: number;
  actual: number;
  compare: boolean;
  tone?: string;
}) {
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

export function MonthFlow({ plan, currency }: { plan: MonthPlan; currency: string }) {
  const left = plan.leftToSave.planned;
  const bills = plan.bills.items.length;
  const buckets = plan.funding.items.length;
  return (
    <Card aria-label="Monthly flow" className="border-transparent bg-tint-plan">
      <CardContent className="grid items-center gap-6 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <FlowStep label="Income" currency={currency} planned={plan.income.planned} actual={plan.income.actual} compare={plan.compareActual} />
            <ArrowRight className="text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
            <FlowStep label="Bills" currency={currency} planned={plan.bills.planned} actual={plan.bills.actual} compare={plan.compareActual} />
            <ArrowRight className="text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
            <FlowStep label="Bucket funding" currency={currency} planned={plan.funding.planned} actual={plan.funding.actual} compare={plan.compareActual} />
            <ArrowRight className="text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
            <FlowStep
              label="Left to save"
              currency={currency}
              planned={left}
              actual={plan.leftToSave.actual}
              compare={plan.compareActual}
              tone={left < 0 ? "text-attn" : "text-pos"}
            />
          </div>
          <div className="mt-4">
            <SplitBar
              label={`Of income: bills ${formatMoney(currency, plan.bills.planned)}, bucket funding ${formatMoney(currency, plan.funding.planned)}, left to save ${formatMoney(currency, left)}`}
              segments={[
                { key: "bills", label: countLabel(bills, "bill", "bills"), color: billColor, value: plan.bills.planned, amount: <Amount currency={currency} minor={plan.bills.planned} /> },
                { key: "buckets", label: countLabel(buckets, "bucket", "buckets"), color: bucketColor, value: plan.funding.planned, amount: <Amount currency={currency} minor={plan.funding.planned} /> },
                { key: "save", label: "Left to save", color: saveColor, value: Math.max(0, left), amount: <Amount currency={currency} minor={left} /> },
              ]}
            />
          </div>
        </div>
        <PaycheckSplitIllustration />
      </CardContent>
    </Card>
  );
}

function Feasibility({ plan, currency }: { plan: MonthPlan; currency: string }) {
  const { openEditor } = useEditors();
  const item = plan.feasibility;
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
          Each paycheck is <Amount currency={currency} minor={item.expectedPaycheck} />. Bills take <Amount currency={currency} minor={item.billsEach} />. Spending refills take <Amount currency={currency} minor={item.refillsEach} />. <Amount currency={currency} minor={item.surplus} /> is left for goals and sinking funds.
        </p>
        {item.shortfall > 0 ? (
          <p className="px-5 font-semibold text-attn">
            Goals and sinking funds need <Amount currency={currency} minor={item.need} className="text-attn" /> each paycheck. That is <Amount currency={currency} minor={item.shortfall} className="text-attn" /> short. Cut <Amount currency={currency} minor={item.shortfall} className="text-attn" /> from other buckets each paycheck.
          </p>
        ) : (
          <p className="px-5">These amounts fit in the paycheck.</p>
        )}
        {item.buckets.map((bucket) => (
          <ListRow key={bucket.bucketId} simple onOpen={() => void openEditor("bucket", { id: bucket.bucketId })}>
            <span className={listName}>
              {bucket.name}
              {bucket.laterDate ? <small>A date of {longDate(bucket.laterDate)} fits.</small> : null}
            </span>
            <span className={listAmt}>
              <Amount currency={currency} minor={bucket.perPaycheck} />
              <small>each paycheck</small>
            </span>
          </ListRow>
        ))}
      </CardContent>
    </Card>
  );
}

export function MonthDetails({ plan, currency }: { plan: MonthPlan; currency: string }) {
  const { openEditor } = useEditors();
  return (
    <>
      <Feasibility plan={plan} currency={currency} />
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <ListCard label="Bills" title="Bills" actions={<span className="text-sm font-semibold tabular-nums">{formatMoney(currency, plan.bills.planned)}</span>}>
          {plan.bills.items.length === 0 ? <p className="px-5 py-5 text-muted-foreground">No bills this month.</p> : null}
          {plan.bills.items.map((item) => (
            <ListRow key={`${item.planId}-${item.dueDate}`} onOpen={() => void openEditor("plan", { id: item.planId })}>
              <span className="w-14 shrink-0 text-[13px] text-muted-foreground">{shortDate(item.dueDate)}</span>
              <span className={listName}>
                {item.name}
                {plan.compareActual && item.actual !== null ? <Badge variant="positive">Paid</Badge> : null}
              </span>
              <span className={listAmt}>
                <Amount currency={currency} minor={item.planned} />
                {plan.compareActual && item.actual !== null && item.actual !== item.planned ? (
                  <small>Actual {formatMoney(currency, item.actual)}</small>
                ) : null}
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
                {item.kind === "spending" ? null : (
                  <small>
                    {formatMoney(currency, item.perPaycheck)} × {countLabel(item.paychecks, "paycheck", "paychecks")}
                  </small>
                )}
              </span>
              <span className={listAmt}>
                <Amount currency={currency} minor={item.planned} />
                {plan.compareActual ? <small>Actual {formatMoney(currency, item.actual)}</small> : null}
              </span>
            </ListRow>
          ))}
        </ListCard>
      </div>
    </>
  );
}
