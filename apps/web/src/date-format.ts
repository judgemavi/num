import { Temporal } from "@num/shared";

export function formatCalendarDate(iso: string, options: Intl.DateTimeFormatOptions) {
  return Temporal.PlainDate.from(iso).toLocaleString(undefined, options);
}

export function formatDate(iso: string) {
  return formatCalendarDate(iso, { dateStyle: "medium" });
}
