import { Temporal, billReserveDays, type InboxItem, type InboxKind, type PlanFrequency, type UnreadableReason } from "@num/shared";
import { unreadableLabel } from "@/accounts/import-format";
import type { Hue } from "@/components/hue";
import { formatMoney } from "@/money";

const kindHue: Record<InboxKind, Hue | "attention"> = {
  import_review: "sky",
  uncategorized: "sky",
  recurring_changed: "lilac",
  recurring_missed: "lilac",
  recurring_ambiguous: "lilac",
  plan_proposal: "lilac",
  transfer_pair: "butter",
  import_unreadable: "butter",
  bucket_overspent: "attention",
  paycheck_funding: "mint",
};

export function inboxHue(kind: InboxKind): Hue | "attention" {
  return kindHue[kind];
}

export function shortDate(iso: string): string {
  return Temporal.PlainDate.from(iso).toLocaleString(undefined, { month: "short", day: "numeric" });
}

function perDay(amount: number, days: number): number {
  if (days <= 0) {
    return amount;
  }
  const negative = amount < 0;
  const magnitude = Math.abs(amount);
  const quotient = Math.floor(magnitude / days);
  const remainder = magnitude % days;
  const rounded = remainder * 2 >= days ? quotient + 1 : quotient;
  return negative ? -rounded : rounded;
}

export function paydayHint(currency: string, asOf: string, nextIncome: string | null, safe: number): string {
  if (nextIncome === null) {
    return `No paycheck on the plan · next ${billReserveDays} days · about ${formatMoney(currency, perDay(safe, billReserveDays))} a day`;
  }
  const days = Temporal.PlainDate.from(asOf).until(Temporal.PlainDate.from(nextIncome), { largestUnit: "day" }).days;
  const when = Temporal.PlainDate.from(nextIncome).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return `Payday is ${when} · about ${formatMoney(currency, perDay(safe, days))} a day`;
}

export function inboxKicker(asOf: string): string {
  return Temporal.PlainDate.from(asOf).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export function repeatLabel(freq: PlanFrequency, interval: number): string {
  const unit = freq === "weekly" ? "week" : freq === "monthly" ? "month" : "year";
  if (interval === 1) {
    return `Every ${unit}`;
  }
  return `Every ${interval} ${unit}s`;
}

export function importAge(asOf: string, lastImportAt: string | null, staleDays: number): { label: string; stale: boolean } {
  if (!lastImportAt) {
    return { label: "No import yet", stale: true };
  }
  const imported = Temporal.Instant.from(lastImportAt).toZonedDateTimeISO(Temporal.Now.timeZoneId()).toPlainDate();
  const days = imported.until(Temporal.PlainDate.from(asOf), { largestUnit: "day" }).days;
  const age = days < 0 ? 0 : days;
  const label = age === 0 ? "Today" : age === 1 ? "Yesterday" : `${age} days ago`;
  return { label, stale: age > staleDays };
}

export function inboxError(code: string): string {
  switch (code) {
    case "import_match_invalid":
      return "That match is no longer available.";
    case "import_review_not_found":
      return "That import row is already decided.";
    case "transfer_pair_not_found":
      return "That transfer is no longer available.";
    case "bucket_not_overspent":
      return "That bucket is no longer over.";
    case "bucket_short":
      return "That bucket does not have enough to cover this.";
    case "fund_over_unassigned":
      return "Unassigned does not have enough to cover this.";
    case "inbox_item_not_found":
      return "That item is no longer in the inbox.";
    case "occurrence_taken":
      return "That occurrence already has a decision.";
    case "transaction_reconciled":
      return "Unlock the checkpoint before this change.";
    default:
      return "The change did not save. Try again.";
  }
}

type Names = {
  account: (id: string) => string;
  plan: (id: string) => string;
  merchant: (id: string) => string;
  category: (id: string) => string;
  bucket: (id: string) => string;
};

export function itemTitle(item: InboxItem, names: Names, currency: string): string {
  switch (item.kind) {
    case "import_review":
      return `Choose a match for ${item.payeeRaw}`;
    case "uncategorized":
      return item.payeeRaw.length > 0 ? item.payeeRaw : "Needs a category";
    case "recurring_changed":
      return `${names.plan(item.planId)} went from ${formatMoney(currency, item.expectedAmount)} to ${formatMoney(currency, item.actualAmount)}`;
    case "recurring_missed":
      return `${names.plan(item.planId)} was missed`;
    case "recurring_ambiguous":
      return `${names.plan(item.planId)} has more than one match`;
    case "plan_proposal":
      return `${names.merchant(item.merchantId)} looks like a repeating payment`;
    case "transfer_pair":
      return `Possible transfer, ${formatMoney(currency, Math.abs(item.left.amount))}`;
    case "bucket_overspent":
      return `${names.bucket(item.bucketId)} is over by ${formatMoney(currency, Math.abs(item.balance))}`;
    case "import_unreadable":
      return "A statement row could not be read";
    case "paycheck_funding":
      return "Fund this paycheck";
  }
}

export function itemWhy(item: InboxItem, names: Names, currency: string): string {
  switch (item.kind) {
    case "import_review":
      return `${shortDate(item.date)} · ${names.account(item.accountId)} · ${formatMoney(currency, item.amount)}`;
    case "uncategorized":
      return `${shortDate(item.date)} · ${names.account(item.accountId)} · ${formatMoney(currency, item.amount)}`;
    case "recurring_changed":
      return `Charged ${shortDate(item.date)}. Update the plan?`;
    case "recurring_missed":
      return `Due ${shortDate(item.dueDate)}. Skip it, or link the payment.`;
    case "recurring_ambiguous":
      return `Due ${shortDate(item.dueDate)}. Pick the payment that belongs to this plan.`;
    case "plan_proposal":
      return `${repeatLabel(item.freq, item.interval)} · ${formatMoney(currency, item.expectedAmount)} · from ${shortDate(item.startDate)}`;
    case "transfer_pair":
      return `${shortDate(item.left.date)} ${names.account(item.left.accountId)} and ${shortDate(item.right.date)} ${names.account(item.right.accountId)}. A transfer is not spending.`;
    case "bucket_overspent":
      return "Cover it from another bucket.";
    case "import_unreadable":
      return `${names.account(item.accountId)} · line ${item.line}. ${unreadableLabel(item.reason as UnreadableReason)}`;
    case "paycheck_funding":
      return `${item.payee} · ${shortDate(item.date)} · ${formatMoney(currency, item.amount)}`;
  }
}
