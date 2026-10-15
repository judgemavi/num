import { forecastDayCount, reviewAgeDays, type HygieneCheck } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { hygieneQuery } from "@/api/insights";
import { localAsOf } from "@/as-of";
import { useBookCurrency, useBucketNames } from "@/editors/lookups";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { Badge } from "@/components/ui/badge";
import { monthTitle, rateText, signedMoney } from "@/insights/format";
import { formatMoney } from "@/money";
import { formatDate } from "@/transactions/format";

type PoolShort = Extract<HygieneCheck, { code: "pool_short" }>;

/** The date and the amount, the buckets to pause, the savings that would give money back and the part not covered. */
function poolShortText(check: PoolShort, currency: string, nameOf: (id: string) => string) {
  if (check.pass || check.date === null) {
    return `Unassigned stays above zero in the next ${forecastDayCount} days.`;
  }
  const parts = [`Pool runs short on ${formatDate(check.date)} by ${formatMoney(currency, check.short)}.`];
  if (check.pause.length > 0) {
    parts.push(`Pause ${check.pause.map((item) => `${nameOf(item.bucketId)} (${formatMoney(currency, item.monthly)} a month)`).join(", ")}.`);
  }
  if (check.recede.length > 0) {
    const gives = check.recede.map((item) => `${nameOf(item.bucketId)} gives back ${formatMoney(currency, item.amount)}`).join(", ");
    parts.push(check.pause.length > 0 ? `Or ${gives}.` : `${gives.charAt(0).toUpperCase()}${gives.slice(1)}.`);
  }
  if (check.uncovered > 0) {
    parts.push(`${formatMoney(currency, check.uncovered)} is not covered.`);
  }
  return parts.join(" ");
}

function detail(check: HygieneCheck, currency: string, nameOf: (id: string) => string) {
  if (check.code === "bills_short") {
    if (check.pass) {
      return "Each bill due in the next 30 days has its money.";
    }
    return check.items.map((item) => `${nameOf(item.bucketId)} is ${formatMoney(currency, item.short)} short for ${formatDate(item.dueDate)}`).join(" · ");
  }
  if (check.code === "savings_used") {
    if (check.pass) {
      return "No savings went back to Unassigned this month.";
    }
    const given = check.items.map((item) => `${nameOf(item.bucketId)} ${formatMoney(currency, item.amount)} to cover ${nameOf(item.coveredId)}`).join(" · ");
    return `${formatMoney(currency, check.total)} went back to Unassigned this month: ${given}`;
  }
  if (check.code === "pool_short") {
    return poolShortText(check, currency, nameOf);
  }
  if (check.code === "emergency_fund") {
    return `${formatMoney(currency, check.balance)} saved of ${formatMoney(currency, check.target)} · ${check.months} ${check.months === 1 ? "month" : "months"} of essential spending`;
  }
  if (check.code === "imports_current") {
    const stale = check.items.filter((item) => !item.pass);
    const missing = check.items.filter((item) => item.lastImportDate === null);
    if (check.items.length === 0) {
      return "No on-budget accounts.";
    }
    const imported = check.items.length - missing.length;
    const fresh =
      stale.length === 0
        ? `Each imported account has an import in the last ${check.staleImportDays} days.`
        : `${stale.length} of ${imported} imported accounts are older than ${check.staleImportDays} days.`;
    if (missing.length === 0) {
      return fresh;
    }
    const absent = missing.length === 1 ? "1 not imported." : `${missing.length} not imported.`;
    return imported === 0 ? absent : `${fresh} ${absent}`;
  }
  if (check.code === "review") {
    if (check.oldCount === 0) {
      return `Nothing is older than ${reviewAgeDays} days.`;
    }
    return `${check.oldCount} older than ${reviewAgeDays} days.`;
  }
  if (check.code === "savings_rate") {
    if (check.months.length === 0) {
      return "No complete month yet.";
    }
    return check.months.map((item) => `${monthTitle(item.month)} ${rateText(item.savingsRateMilliPct)}`).join(" · ");
  }
  if (check.code === "recurring") {
    if (check.missed === 0) {
      return "No missed payments.";
    }
    return `${check.missed} missed ${check.missed === 1 ? "payment" : "payments"} under This month on Home.`;
  }
  if (check.pass) {
    return check.count === 0 ? "No bucket is below zero." : `${check.count} below zero · Unassigned covers it.`;
  }
  return `Unassigned is ${signedMoney(currency, check.unassigned)}. It cannot cover ${check.count} ${check.count === 1 ? "bucket" : "buckets"} below zero.`;
}

const titles: Record<HygieneCheck["code"], string> = {
  emergency_fund: "Emergency fund",
  bills_short: "Bills",
  savings_used: "Savings used",
  pool_short: "Pool runs short",
  imports_current: "Imports are current",
  review: "Review",
  savings_rate: "Savings rate",
  recurring: "Recurring",
  overspent: "Buckets",
};

const places: Record<HygieneCheck["code"], string> = {
  emergency_fund: "Buckets",
  bills_short: "Buckets",
  savings_used: "Buckets",
  pool_short: "Buckets",
  imports_current: "Imports",
  review: "Review",
  savings_rate: "Insights",
  recurring: "Home",
  overspent: "Buckets",
};

/** The hygiene checks of the book. The card reads its own data. */
export function HygienePanel() {
  const go = useNavigate();
  const currency = useBookCurrency();
  const names = useBucketNames();
  const nameOf = (id: string) => names.get(id) ?? "Bucket";
  const { data: hygiene } = useSuspenseQuery(hygieneQuery(localAsOf()));
  const failedCount = hygiene.checks.filter((item) => !item.pass).length;

  function open(check: HygieneCheck) {
    if (check.code === "emergency_fund" ||
      check.code === "bills_short" ||
      check.code === "savings_used" ||
      check.code === "pool_short" ||
      check.code === "overspent") {
      void go({ to: "/buckets" });
      return;
    }
    if (check.code === "imports_current") {
      void go({ to: "/accounts/imports" });
      return;
    }
    if (check.code === "review") {
      void go({ to: "/transactions/review" });
      return;
    }
    if (check.code === "recurring") {
      void go({ to: "/" });
      return;
    }
    const month = check.code === "savings_rate" ? check.months[0]?.month : undefined;
    if (month) {
      void go({ to: "/insights", search: { month } });
    }
  }

  return (
    <ListCard
      label="Hygiene"
      title="Hygiene"
      actions={<Badge variant={failedCount === 0 ? "positive" : "count"}>{failedCount === 0 ? "Clear" : failedCount}</Badge>}
    >
      {hygiene.checks.map((check) => (
        <ListRow key={check.code} onOpen={() => open(check)}>
          <span className={listName}>
            {titles[check.code]}
            <small>
              {detail(check, currency, nameOf)} · {places[check.code]}
            </small>
          </span>
          <Badge variant={check.pass ? "positive" : "attention"}>{check.pass ? "Pass" : "Needs you"}</Badge>
        </ListRow>
      ))}
    </ListCard>
  );
}
