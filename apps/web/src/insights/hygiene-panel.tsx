import { inboxAgeDays, type Hygiene, type HygieneCheck } from "@num/shared";
import { useNavigate } from "@tanstack/react-router";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { Badge } from "@/components/ui/badge";
import { monthTitle, rateText, signedMoney } from "@/insights/format";
import { formatMoney } from "@/money";

const listSearch = { page: 1, pageSize: 50, archived: false } as const;

function detail(check: HygieneCheck, currency: string): string {
  if (check.code === "emergency_fund") {
    const place = check.source === "goals" ? "essential goals" : "savings accounts";
    return `${formatMoney(currency, check.held)} in ${place} · ${check.months} months needs ${formatMoney(currency, check.need)}`;
  }
  if (check.code === "cards_paid") {
    const late = check.items.filter((item) => !item.pass);
    if (check.items.length === 0) {
      return "No card is set to pay the full statement.";
    }
    if (late.length === 0) {
      return "Each latest statement was paid by its due date.";
    }
    return `${late.length} still unpaid after the due date.`;
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
  if (check.code === "month_closed") {
    if (check.status === "none") {
      return `${monthTitle(check.month)} is not in the book.`;
    }
    if (check.status === "closed") {
      return `${monthTitle(check.month)} is closed.`;
    }
    return `${monthTitle(check.month)} is still open.`;
  }
  if (check.code === "inbox_age") {
    if (check.oldCount === 0) {
      return `Nothing is older than ${inboxAgeDays} days.`;
    }
    return `${check.oldCount} older than ${inboxAgeDays} days.`;
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
      return "No closed months yet.";
    }
    return check.months.map((item) => `${monthTitle(item.month)} ${rateText(item.savingsRateMilliPct)}`).join(" · ");
  }
  if (check.code === "recurring") {
    if (check.changed === 0 && check.missed === 0) {
      return "No changed or missed payments.";
    }
    return `${check.changed} changed · ${check.missed} missed.`;
  }
  if (check.count === 0) {
    return "No bucket is below zero.";
  }
  return `${check.count} below zero · ${signedMoney(currency, check.balance)}`;
}

const titles: Record<HygieneCheck["code"], string> = {
  emergency_fund: "Emergency fund",
  cards_paid: "Cards paid in full",
  imports_current: "Imports are current",
  month_closed: "Previous month",
  inbox_age: "Inbox",
  sinking_funds: "Sinking funds",
  savings_rate: "Savings rate",
  recurring: "Recurring",
  overspent: "Buckets",
};

const places: Record<HygieneCheck["code"], string> = {
  emergency_fund: "Buckets",
  cards_paid: "Accounts",
  imports_current: "Imports",
  month_closed: "This month",
  inbox_age: "Inbox",
  sinking_funds: "Buckets",
  savings_rate: "Months",
  recurring: "Recurring",
  overspent: "Buckets",
};

export function HygienePanel({
  currency,
  hygiene,
  pending,
  failed,
  onMonth,
}: {
  currency: string;
  hygiene: Hygiene | undefined;
  pending: boolean;
  failed: boolean;
  onMonth: (month: string) => void;
}) {
  const go = useNavigate();
  const failedCount = hygiene?.checks.filter((item) => !item.pass).length ?? 0;

  function open(check: HygieneCheck) {
    if (check.code === "emergency_fund" || check.code === "sinking_funds" || check.code === "overspent") {
      void go({ to: "/buckets", search: listSearch });
      return;
    }
    if (check.code === "cards_paid") {
      void go({ to: "/accounts", search: listSearch });
      return;
    }
    if (check.code === "imports_current") {
      void go({ to: "/accounts/imports", search: { page: 1, pageSize: 50 } });
      return;
    }
    if (check.code === "inbox_age") {
      void go({ to: "/" });
      return;
    }
    if (check.code === "recurring") {
      void go({ to: "/recurring", search: listSearch });
      return;
    }
    if (check.code === "month_closed" && check.status !== "none") {
      onMonth(check.month);
      return;
    }
    const month = check.code === "savings_rate" ? check.months[0]?.month : undefined;
    if (month) {
      onMonth(month);
    }
  }

  return (
    <ListCard
      label="Hygiene"
      title="Hygiene"
      actions={hygiene ? <Badge variant={failedCount === 0 ? "positive" : "count"}>{failedCount === 0 ? "Clear" : failedCount}</Badge> : null}
    >
      {pending ? <p className="px-5 py-4 text-sm text-muted-foreground">Loading hygiene.</p> : null}
      {failed ? <p className="px-5 py-4 text-sm">Hygiene did not load.</p> : null}
      {hygiene?.checks.map((check) => (
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
