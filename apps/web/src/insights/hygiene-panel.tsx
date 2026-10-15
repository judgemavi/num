import { reviewAgeDays, type HygieneCheck } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { hygieneQuery } from "@/api/insights";
import { localAsOf } from "@/as-of";
import { useBookCurrency } from "@/editors/lookups";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { Badge } from "@/components/ui/badge";
import { monthTitle, rateText, signedMoney } from "@/insights/format";
import { formatMoney } from "@/money";


function detail(check: HygieneCheck, currency: string) {
  if (check.code === "emergency_fund") {
    return `${formatMoney(currency, check.balance)} saved · ${check.months} ${check.months === 1 ? "month" : "months"} of ${formatMoney(currency, check.monthly)} is ${formatMoney(currency, check.target)}`;
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
  if (check.code === "sinking_funds") {
    if (check.yearly === 0) {
      return "No yearly bills.";
    }
    if (check.missing.length === 0) {
      return "Each yearly bill has a sinking fund.";
    }
    return `${check.missing.length} of ${check.yearly} yearly bills have no sinking fund.`;
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
  imports_current: "Imports are current",
  review: "Review",
  sinking_funds: "Sinking funds",
  savings_rate: "Savings rate",
  recurring: "Recurring",
  overspent: "Buckets",
};

const places: Record<HygieneCheck["code"], string> = {
  emergency_fund: "Buckets",
  imports_current: "Imports",
  review: "Review",
  sinking_funds: "Buckets",
  savings_rate: "Insights",
  recurring: "Home",
  overspent: "Buckets",
};

/** The hygiene checks of the book. The card reads its own data. */
export function HygienePanel() {
  const go = useNavigate();
  const currency = useBookCurrency();
  const { data: hygiene } = useSuspenseQuery(hygieneQuery(localAsOf()));
  const failedCount = hygiene.checks.filter((item) => !item.pass).length;

  function open(check: HygieneCheck) {
    if (check.code === "emergency_fund" || check.code === "sinking_funds" || check.code === "overspent") {
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
              {detail(check, currency)} · {places[check.code]}
            </small>
          </span>
          <Badge variant={check.pass ? "positive" : "attention"}>{check.pass ? "Pass" : "Needs you"}</Badge>
        </ListRow>
      ))}
    </ListCard>
  );
}
