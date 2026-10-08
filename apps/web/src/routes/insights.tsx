import { createFileRoute } from "@tanstack/react-router";
import { editOnly } from "@/editors/page-search";
import { MonthsScreen } from "@/insights/months-screen";
import { isMonthKey } from "@num/shared";

export const Route = createFileRoute("/insights")({
  validateSearch: (search: Record<string, unknown>): { edit?: string; month?: string } => {
    const base = editOnly(search);
    const month = typeof search.month === "string" && isMonthKey(search.month) ? search.month : undefined;
    return month ? { ...base, month } : base;
  },
  component: MonthsScreen,
});
