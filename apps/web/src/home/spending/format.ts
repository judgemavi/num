import { Temporal } from "@num/shared";

export function monthTitle(month: string): string {
  return Temporal.PlainDate.from(`${month}-01`).toLocaleString(undefined, { month: "long", year: "numeric" });
}

export function rateText(milliPct: number | null): string {
  if (milliPct === null) {
    return "No income";
  }
  return new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(milliPct / 100_000);
}

