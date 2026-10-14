import { Temporal } from "@num/shared";
import { formatMoney } from "@/money";

export function monthTitle(month: string): string {
  return Temporal.PlainDate.from(`${month}-01`).toLocaleString(undefined, { month: "long", year: "numeric" });
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
