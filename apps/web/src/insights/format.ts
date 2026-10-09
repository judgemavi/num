import { Temporal, type CloseBlockerCode, type ErrorCode, type MonthStatus } from "@num/shared";
import { formatMoney } from "@/money";

const monthErrorText: Partial<Record<ErrorCode, string>> = {
  month_not_ended: "This month has not ended.",
  month_not_ready: "This month is not ready to close.",
  month_closed: "This month is already closed.",
  month_not_closed: "This month is open.",
  month_not_found: "This month is not in the book.",
  as_of_invalid: "The date is not valid.",
};

export function monthError(code: ErrorCode): string {
  return monthErrorText[code] ?? "The month did not save. Try again.";
}

export function monthTitle(month: string): string {
  return Temporal.PlainDate.from(`${month}-01`).toLocaleString(undefined, { month: "long", year: "numeric" });
}

export function statusLabel(status: MonthStatus): string {
  if (status === "ready") {
    return "Ready to close";
  }
  if (status === "closed") {
    return "Closed";
  }
  return "Open";
}

export function statusVariant(status: MonthStatus): "neutral" | "positive" | "attention" {
  if (status === "closed") {
    return "positive";
  }
  if (status === "ready") {
    return "attention";
  }
  return "neutral";
}

export function blockerText(code: CloseBlockerCode, accountName: string | null): string {
  if (code === "month_not_ended") {
    return "This month has not ended.";
  }
  if (code === "inbox_open") {
    return "The Inbox still has something from this month.";
  }
  return `${accountName ?? "An account"} needs a statement on or after the last day of this month.`;
}

export function rateText(milliPct: number | null): string {
  if (milliPct === null) {
    return "No income";
  }
  return new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(milliPct / 100_000);
}

export function signedMoney(currency: string, minor: number): string {
  const text = formatMoney(currency, Math.abs(minor));
  if (minor > 0) {
    return `+${text}`;
  }
  if (minor < 0) {
    return `−${text}`;
  }
  return text;
}
