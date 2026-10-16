import { formatCalendarDate } from "@/date-format";

export function monthTitle(month: string): string {
  return formatCalendarDate(`${month}-01`, { month: "long", year: "numeric" });
}

export function rateText(milliPct: number | null): string {
  if (milliPct === null) {
    return "No income";
  }
  return new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(milliPct / 100_000);
}

