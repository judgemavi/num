import { formatCalendarDate } from "@/date-format";
import { Temporal, type ErrorCode } from "@num/shared";
import { errorCode } from "@/api/client";
import { localAsOf } from "@/as-of";
import { Boundary } from "@/components/boundary";
import { useBookCurrency, useTagNames } from "@/editors/lookups";
import { monthTitle, rateText } from "@/home/spending/format";
import { PeriodSelect } from "@/home/spending/period-select";
import { SelectionClear } from "@/home/spending/selection-clear";
import { TagSelect } from "@/home/spending/tag-select";
import { useSpendingReport } from "@/home/spending/use-spending";
import { spendingContent } from "@/home/spending-lazy";
import { formatMoney } from "@/money";

const errorText: Partial<Record<ErrorCode, string>> = {
  period_invalid: "The start date is after the end date, or the month is not in the period.",
  category_not_found: "That category is not in the book.",
  tag_not_found: "That tag is not in the book.",
  as_of_invalid: "The date is not valid.",
};

function shortMonth(iso: string) {
  return formatCalendarDate(iso, { month: "short", year: "numeric" });
}

/** The name of the breakdown range: one month (with the year when it is not this year), or the first and the last month. */
function rangeName(from: string, to: string) {
  if (from.slice(0, 7) === to.slice(0, 7)) {
    const sameYear = from.slice(0, 4) === localAsOf().slice(0, 4);
    return sameYear ? formatCalendarDate(from, { month: "long" }) : monthTitle(from.slice(0, 7));
  }
  return `${shortMonth(from)} – ${shortMonth(to)}`;
}

/**
 * One muted line that follows the selected period. A complete period (it ends before today) shows the spending of the
 * income and the savings rate. A period that is not complete shows only the spending and the income so far.
 * With a tag, the line shows only the range and the spending of the tag.
 */
function SpendingLine() {
  const currency = useBookCurrency();
  const tagNames = useTagNames();
  const { data } = useSpendingReport();
  const name = rangeName(data.range.from, data.range.to);
  const spent = formatMoney(currency, data.spending);
  const complete = Temporal.PlainDate.compare(data.range.to, localAsOf()) < 0;
  const range = complete ? name : `${name} so far`;
  // The report of a tag has no income.
  if (data.income === null) {
    return <p className="text-sm text-muted-foreground">{`${range} · ${spent} spent on ${tagNames.get(data.tagId ?? "") ?? "Unknown"}`}</p>;
  }
  const income = formatMoney(currency, data.income);
  const parts = complete ? [name, `${spent} spent of ${income} income`] : [range, `${spent} spent`, `${income} income`];
  if (complete && data.savingsRateMilliPct !== null) {
    parts.push(`${rateText(data.savingsRateMilliPct)} saved`);
  }
  return <p className="text-sm text-muted-foreground">{parts.join(" · ")}</p>;
}

/**
 * Spending on Home: the period (default this month), the tag (default all spending), the timeline, the spending donut
 * and the list of groups and categories. The period and the tag selectors and "Clear" stay outside the boundary, thus
 * the person can change a period or a tag that does not load.
 */
export function SpendingSection() {
  return (
    <section aria-labelledby="home-spending" className="grid gap-5">
      <div className="grid gap-1.5">
        <h2 id="home-spending" className="font-display text-[28px] leading-none font-extrabold uppercase [font-stretch:72%]">
          Spending
        </h2>
        <Boundary loading={null} failed={() => null}>
          <SpendingLine />
        </Boundary>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <PeriodSelect />
        <Boundary loading={null} failed={() => null}>
          <TagSelect />
        </Boundary>
        <SelectionClear />
      </div>
      <Boundary
        onRetry={spendingContent.retry}
        loading="Loading spending."
        failed={({ error }) => {
          const code = errorCode(error);
          return (code && errorText[code]) ?? "Spending did not load.";
        }}
      >
        <spendingContent.Component />
      </Boundary>
    </section>
  );
}
